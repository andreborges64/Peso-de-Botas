Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
package br.com.pesodebotas.app

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.ActivityResultLauncher
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.abs

private fun JSONObject.obj(key: String) = optJSONObject(key) ?: JSONObject()
private fun JSONObject.arr(key: String) = optJSONArray(key) ?: JSONArray()
private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
private fun JSONObject.str(key: String, fallback: String = "") = if (isNull(key)) fallback else optString(key, fallback)
private fun JSONObject.num(key: String, fallback: Double = 0.0): Double = when (val v = opt(key)) {
    is Number -> v.toDouble()
    is String -> v.replace(',', '.').toDoubleOrNull() ?: fallback
    else -> fallback
}
private fun JSONObject.bool(key: String) = optBoolean(key, false)
private fun JSONArray.addJson(value: JSONObject) { put(value) }
private fun cloneJson(value: JSONObject) = JSONObject(value.toString())
private fun fmt(value: Double?, digits: Int = 3): String = value?.let {
    String.format(Locale("pt", "BR"), "%1$.${digits}f", it)
} ?: "—"
private fun nowIso(): String = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).format(Date())
private fun todayIso(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
private fun datePt(value: String?): String = try {
    if (value.isNullOrBlank()) "—" else SimpleDateFormat("dd/MM/yyyy", Locale("pt", "BR")).format(SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(value)!!)
} catch (_: Exception) { value ?: "—" }

private data class BaseMeta(val id: String, val name: String, val createdAt: String, val updatedAt: String)
private data class CalcResult(
    val gross: Double, val deduction: Double, val net: Double,
    val bico: Double, val palmilha: Double, val meia: Double,
    val bicoNum: String, val palmilhaNum: String, val meiaType: String,
    val right: Double, val left: Double, val soleRight: Double?, val soleLeft: Double?,
    val caneRight: Double?, val caneLeft: Double?, val solePair: Double?, val system: Double?
)

private class DbRepository(context: Context) {
    private val prefs = context.getSharedPreferences("peso_botas_native_v1", Context.MODE_PRIVATE)
    private val basePrefix = "db_"
    var bases: MutableList<BaseMeta> = mutableListOf()
        private set
    var activeId: String = ""
        private set
    var database: JSONObject = JSONObject()
        private set

    fun load(context: Context) {
        bases = mutableListOf()
        val rawBases = prefs.getString("bases", "[]") ?: "[]"
        try {
            JSONArray(rawBases).objects().forEach { b ->
                bases.add(BaseMeta(b.str("id"), b.str("name"), b.str("createdAt"), b.str("updatedAt")))
            }
        } catch (_: Exception) { }
        activeId = prefs.getString("active_id", "") ?: ""
        if (bases.isNotEmpty()) {
            if (bases.none { it.id == activeId }) activeId = bases.first().id
            val stored = prefs.getString(basePrefix + activeId, null)
            if (stored != null) try { database = JSONObject(stored) } catch (_: Exception) { }
        }
        if (database.length() == 0) {
            val legacy = prefs.getString("legacy_db", null)
            if (legacy != null) try { database = JSONObject(legacy) } catch (_: Exception) { }
        }
        if (database.length() == 0) {
            database = JSONObject(context.assets.open("data-inicial.json").bufferedReader().use { it.readText() })
            database.put("createdAt", nowIso())
        }
        if (activeId.isBlank() || bases.none { it.id == activeId }) {
            activeId = "base-${UUID.randomUUID()}"
            bases = mutableListOf(BaseMeta(activeId, "Base principal", nowIso(), nowIso()))
        }
        normalize(database)
        save()
    }

    fun save() {
        val current = bases.indexOfFirst { it.id == activeId }
        if (current >= 0) bases[current] = bases[current].copy(updatedAt = nowIso())
        val array = JSONArray()
        bases.forEach { array.put(JSONObject().put("id", it.id).put("name", it.name).put("createdAt", it.createdAt).put("updatedAt", it.updatedAt).put("storage", "local")) }
        prefs.edit().putString("bases", array.toString()).putString("active_id", activeId)
            .putString(basePrefix + activeId, database.toString()).putString("legacy_db", database.toString()).apply()
    }

    fun activate(id: String) {
        require(bases.any { it.id == id }) { "Base não encontrada." }
        val raw = prefs.getString(basePrefix + id, null) ?: throw IllegalStateException("Os dados desta base não foram encontrados neste dispositivo.")
        activeId = id
        database = JSONObject(raw)
        normalize(database)
        save()
    }

    fun create(name: String, source: JSONObject, activate: Boolean = true) {
        val id = "base-${UUID.randomUUID()}"
        val copy = cloneJson(source)
        bases.add(BaseMeta(id, name.trim().ifBlank { "Nova base" }, nowIso(), nowIso()))
        if (activate) { activeId = id; database = copy; normalize(database); save() }
        else save()
    }

    fun baseDatabase(id: String): JSONObject {
        val raw = prefs.getString(basePrefix + id, "{}") ?: "{}"
        return try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
    }

    fun exportPayload(): JSONObject {
        val name = bases.firstOrNull { it.id == activeId }?.name ?: "Base de dados"
        return JSONObject().put("format", "peso-botas-base").put("formatVersion", 1)
            .put("baseName", name).put("exportedAt", nowIso()).put("database", cloneJson(database))
    }

    fun importDatabase(payload: JSONObject): JSONObject {
        val incoming = if (payload.optString("format") == "peso-botas-base" && payload.optJSONObject("database") != null) payload.getJSONObject("database") else payload
        require(incoming.optJSONArray("reduced") != null && incoming.optJSONArray("history") != null) { "Arquivo incompatível: faltam os dados de reduzidos ou histórico." }
        return cloneJson(incoming).also { normalize(it) }
    }

    fun restore(payload: JSONObject) { database = importDatabase(payload); save() }

    private fun normalize(db: JSONObject) {
        if (db.optJSONArray("matrices") == null) db.put("matrices", JSONArray())
        if (db.optJSONArray("history") == null) db.put("history", JSONArray())
        if (db.optJSONArray("reduced") == null) db.put("reduced", JSONArray())
        if (db.optJSONArray("collection") == null) db.put("collection", JSONArray())
        if (db.optJSONObject("systemWeights") == null) db.put("systemWeights", JSONObject())
        if (db.optJSONObject("accessoryTables") == null) db.put("accessoryTables", JSONObject())

        val unique = linkedMapOf<String, JSONObject>()
        db.arr("reduced").objects().forEach { raw ->
            val code = raw.str("code").trim()
            if (code.isBlank()) return@forEach
            val item = cloneJson(raw).put("code", code)
            if (item.str("modelPrefix").isBlank()) item.put("modelPrefix", item.str("model").take(2))
            val old = unique[code]
            if (old == null) unique[code] = item else {
                val colors = linkedSetOf<String>()
                old.optJSONArray("colors")?.let { a -> (0 until a.length()).forEach { i -> a.optString(i).trim().takeIf(String::isNotBlank)?.let(colors::add) } }
                old.str("color").split(" / ").map(String::trim).filter(String::isNotBlank).forEach(colors::add)
                item.optJSONArray("colors")?.let { a -> (0 until a.length()).forEach { i -> a.optString(i).trim().takeIf(String::isNotBlank)?.let(colors::add) } }
                item.str("color").split(" / ").map(String::trim).filter(String::isNotBlank).forEach(colors::add)
                val colorArray = JSONArray(); colors.forEach { colorArray.put(it) }
                old.put("colors", colorArray).put("color", colors.joinToString(" / "))
                old.put("hasBico", old.bool("hasBico") || item.bool("hasBico"))
                    .put("hasPalmilha", old.bool("hasPalmilha") || item.bool("hasPalmilha"))
                    .put("hasMeia", old.bool("hasMeia") || item.bool("hasMeia"))
                val socks = cloneJson(old.obj("sockBySize")); item.obj("sockBySize").keys().forEach { socks.put(it, item.obj("sockBySize").opt(it)) }
                old.put("sockBySize", socks)
                if (old.str("model").isBlank()) old.put("model", item.str("model"))
                if (old.str("source") != "app" && item.str("source") == "app") old.put("source", "app")
            }
        }
        val reduced = JSONArray(); unique.values.forEach { reduced.put(it) }; db.put("reduced", reduced)

        val matrices = db.arr("matrices")
        val known = mutableSetOf<String>()
        matrices.objects().forEach { known.add("${it.str("model")}|${it.str("size")}|${it.str("code").lowercase(Locale.ROOT)}") }
        db.arr("history").objects().forEach { h ->
            val collection = h.str("modelPrefix").ifBlank { h.str("model").take(2) }
            val size = h.str("size").trim(); val code = h.str("matrix").trim()
            val key = "$collection|$size|${code.lowercase(Locale.ROOT)}"
            if (collection.isNotBlank() && size.isNotBlank() && code.isNotBlank() && key !in known) {
                matrices.put(JSONObject().put("id", "history-matrix-${collection}-${size}-${code}".replace(Regex("[^a-zA-Z0-9_-]"), "_"))
                    .put("model", collection).put("collection", collection).put("size", size).put("code", code)
                    .put("createdAt", h.opt("createdAt")).put("source", "historico"))
                known.add(key)
            }
        }
        val dedup = JSONArray(); val matrixKeys = mutableSetOf<String>()
        matrices.objects().forEach { m -> val key = "${m.str("model")}|${m.str("size")}|${m.str("code").lowercase(Locale.ROOT)}"; if (matrixKeys.add(key)) dedup.put(m) }
        db.put("matrices", dedup)
    }
}

class MainActivity : ComponentActivity() {
    private lateinit var repo: DbRepository
    private var revision by mutableIntStateOf(0)
    private var notice by mutableStateOf("")
    private var noticeError by mutableStateOf(false)
    private var page by mutableStateOf("dashboard")

    private lateinit var exportLauncher: ActivityResultLauncher<String>
    private lateinit var importLauncher: ActivityResultLauncher<Array<String>>
    private lateinit var restoreLauncher: ActivityResultLauncher<Array<String>>
    private lateinit var csvLauncher: ActivityResultLauncher<String>
    private var pendingCsv: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repo = DbRepository(this)
        repo.load(this)
        exportLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> if (uri != null) writeExport(uri, repo.exportPayload().toString(2)) }
        importLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) readImport(uri, false) }
        restoreLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) readImport(uri, true) }
        csvLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri -> if (uri != null) pendingCsv?.let { writeExport(uri, it) } }
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = androidx.compose.ui.graphics.Color(0xFF173B65), secondary = androidx.compose.ui.graphics.Color(0xFF3276A8))) { AppRoot() } }
    }

    private fun changed(message: String? = null, error: Boolean = false) {
        repo.save(); revision++; if (message != null) { notice = message; noticeError = error }
    }
    private fun writeExport(uri: Uri, content: String) {
        try { contentResolver.openOutputStream(uri)?.bufferedWriter(Charsets.UTF_8)?.use { it.write(content) }; notice = "Arquivo exportado com sucesso."; noticeError = false }
        catch (e: Exception) { notice = "Falha ao salvar arquivo: ${e.message}"; noticeError = true }; revision++
    }
    private fun readImport(uri: Uri, restore: Boolean) {
        try {
            val text = contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: error("Não foi possível ler o arquivo.")
            val payload = JSONObject(text)
            val incoming = repo.importDatabase(payload)
            if (restore) { repo.restore(incoming); changed("Backup restaurado na base atual.") }
            else {
                val name = payload.optString("baseName").takeIf { it.isNotBlank() } ?: "Base importada"
                repo.create(name, incoming, true); changed("Base importada e ativada. A base anterior foi preservada.")
            }
        } catch (e: Exception) { notice = "Não foi possível importar: ${e.message ?: "arquivo inválido"}"; noticeError = true; revision++ }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable private fun AppRoot() {
        val currentRevision = revision
        Scaffold(
            topBar = { TopAppBar(title = { Column { Text("PESO DE BOTAS", fontWeight = FontWeight.Bold); Text("Controle de consumo", style = MaterialTheme.typography.labelSmall) } }, actions = {
                IconButton(onClick = { exportLauncher.launch("backup-peso-botas-${todayIso()}.json") }) { Icon(Icons.Default.FileUpload, "Backup") }
                IconButton(onClick = { restoreLauncher.launch(arrayOf("application/json", "text/*")) }) { Icon(Icons.Default.Restore, "Restaurar") }
            }) },
            bottomBar = { NavigationBar { listOf("dashboard" to ("Visão geral" to Icons.Default.Dashboard), "weighing" to ("Pesagem" to Icons.Default.AddCircle), "history" to ("Histórico" to Icons.Default.History), "matrices" to ("Matrizes" to Icons.Default.ViewList), "registrations" to ("Cadastros" to Icons.Default.Settings), "reports" to ("Relatórios" to Icons.Default.Assessment), "bases" to ("Bases" to Icons.Default.Storage)).forEach { (key, pair) -> NavigationBarItem(selected = page == key, onClick = { page = key }, icon = { Icon(pair.second, pair.first) }, label = { Text(pair.first, fontSize = 9.sp) }) } } },
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                if (notice.isNotBlank()) Surface(color = if (noticeError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Text(notice, Modifier.weight(1f)); IconButton(onClick = { notice = "" }) { Icon(Icons.Default.Close, "Fechar") } }
                }
                when (page) {
                    "dashboard" -> DashboardScreen(repo.database, currentRevision) { page = it }
                    "weighing" -> WeighingScreen(repo.database, currentRevision, onSave = { record -> repo.database.arr("history").put(record); changed("Pesagem salva com sucesso."); page = "history" }, notify = { msg, err -> notice = msg; noticeError = err })
                    "history" -> HistoryScreen(repo.database, currentRevision, onDelete = { id -> repo.database.put("history", JSONArray(repo.database.arr("history").objects().filterNot { it.str("id") == id })); changed("Registro excluído.") }, onCsv = { csv -> pendingCsv = csv; csvLauncher.launch("historico-pesagens-${todayIso()}.csv") })
                    "matrices" -> MatricesScreen(repo.database, currentRevision, onChange = { changed(it) })
                    "registrations" -> RegistrationsScreen(repo.database, currentRevision, onChange = { changed(it) })
                    "reports" -> ReportsScreen(repo.database, currentRevision, onCsv = { csv -> pendingCsv = csv; csvLauncher.launch("relatorio-consumo-${todayIso()}.csv") })
                    else -> BasesScreen(repo, currentRevision, onChange = { changed(it) }, onExport = { exportLauncher.launch("base-peso-botas-${todayIso()}.json") }, onImport = { importLauncher.launch(arrayOf("application/json", "text/*")) }, onCreateBase = { name -> val fresh = JSONObject(assets.open("data-inicial.json").bufferedReader().use { it.readText() }); fresh.put("history", JSONArray()); fresh.put("matrices", JSONArray()); repo.create(name, fresh, true); changed("Nova base criada.") })
                }
            }
        }
    }
}

@Composable
private fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable private fun SectionTitle(title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) { Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

@Composable private fun MetricCard(title: String, value: String, detail: String? = null, modifier: Modifier = Modifier) {
    Card(modifier) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
}

@Composable private fun DashboardScreen(db: JSONObject, revision: Int, navigate: (String) -> Unit) {
    val history = db.arr("history").objects().filterNot { it.bool("deleted") }
    val reduced = db.arr("reduced").objects()
    val matrices = db.arr("matrices").objects()
    val models = reduced.map { it.str("model") }.toSet().size
    val weighed = history.map { "${it.str("model")}|${it.str("size")}|${it.str("matrix")}" }.toSet().size
    ScreenColumn {
        SectionTitle("Visão geral", "Resumo da base atualmente selecionada")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("Pesagens", history.size.toString(), "Registros ativos", Modifier.weight(1f))
            MetricCard("Modelos", models.toString(), "Cadastrados", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("Reduzidos", reduced.size.toString(), "Configurações", Modifier.weight(1f))
            MetricCard("Matrizes usadas", weighed.toString(), "Identificadas no histórico", Modifier.weight(1f))
        }
        Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Acesso rápido", fontWeight = FontWeight.Bold)
            Button(onClick = { navigate("weighing") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Nova pesagem") }
            OutlinedButton(onClick = { navigate("history") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.History, null); Spacer(Modifier.width(8.dp)); Text("Consultar histórico") }
            OutlinedButton(onClick = { navigate("reports") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Assessment, null); Spacer(Modifier.width(8.dp)); Text("Visualizar relatórios") }
            OutlinedButton(onClick = { navigate("bases") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Storage, null); Spacer(Modifier.width(8.dp)); Text("Gerenciar bases e JSON") }
        } }
        SectionTitle("Pesagens recentes")
        val recent = history.sortedByDescending { it.str("createdAt") }.take(5)
        if (recent.isEmpty()) Text("Nenhuma pesagem registrada nesta base.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        recent.forEach { h -> Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(h.str("reduced"), fontWeight = FontWeight.Bold); Text(if (h.str("type") == "BICOLOR") "Bicolor" else "Monocolor", color = MaterialTheme.colorScheme.primary) }
            Text("${h.str("model")} · Tam. ${h.str("size")} · Matriz ${h.str("matrix")}", style = MaterialTheme.typography.bodySmall)
            Text("Líquido: ${fmt(h.num("net"))} kg", fontWeight = FontWeight.SemiBold)
        } } }
        if (matrices.isEmpty()) Text("Cadastre matrizes na área Matrizaria para facilitar a consulta.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable private fun SimpleDropdown(label: String, value: String, options: List<String>, onSelect: (String) -> Unit, enabled: Boolean = true) {
    var expanded by remember(label, value, options.size) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text(value.ifBlank { "Selecione..." }, Modifier.weight(1f), maxLines = 1)
                Icon(Icons.Default.ArrowDropDown, null)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 320.dp)) {
                options.forEach { option -> DropdownMenuItem(text = { Text(option) }, onClick = { onSelect(option); expanded = false }) }
            }
        }
    }
}

@Composable private fun NumberField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, modifier = modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
}

private fun accessoryFor(db: JSONObject, red: JSONObject, size: String): Map<String, Any> {
    val tables = db.obj("accessoryTables")
    val numbering = tables.obj("numbering").obj(size)
    val sock = red.obj("sockBySize").optString(size, "N")
    val bicoNum = if (red.bool("hasBico")) numbering.optString("bico_num", "N") else "N"
    val palmilhaNum = if (red.bool("hasPalmilha")) numbering.optString("palmilha_num", "N") else "N"
    val meiaType = if (red.bool("hasMeia")) sock else "N"
    val bico = if (red.bool("hasBico")) tables.obj("bico").num(bicoNum) else 0.0
    val palmilha = if (red.bool("hasPalmilha")) tables.obj("palmilha").num(palmilhaNum) else 0.0
    val meia = if (red.bool("hasMeia")) tables.obj("meia").num(meiaType) else 0.0
    return mapOf("bico" to bico, "palmilha" to palmilha, "meia" to meia, "bicoNum" to bicoNum, "palmilhaNum" to palmilhaNum, "meiaType" to meiaType)
}

private fun systemWeight(db: JSONObject, code: String, size: String): Double? {
    val list = db.obj("systemWeights").optJSONArray(code) ?: return null
    val first = list.optJSONObject(0) ?: return null
    val weights = first.optJSONObject("weights") ?: return null
    return if (weights.isNull(size)) null else weights.optDouble(size)
}

@Composable private fun WeighingScreen(db: JSONObject, revision: Int, onSave: (JSONObject) -> Unit, notify: (String, Boolean) -> Unit) {
    val reds = db.arr("reduced").objects().distinctBy { it.str("code") }.sortedBy { it.str("code") }
    var type by remember { mutableStateOf("MONOCOLOR") }
    var reducedCode by remember { mutableStateOf("") }
    var size by remember { mutableStateOf("") }
    var matrix by remember { mutableStateOf("") }
    var right by remember { mutableStateOf("") }
    var left by remember { mutableStateOf("") }
    var soleRight by remember { mutableStateOf("") }
    var soleLeft by remember { mutableStateOf("") }
    var bootRight by remember { mutableStateOf("") }
    var bootLeft by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val red = reds.firstOrNull { it.str("code") == reducedCode }
    val sizes = remember(reducedCode, revision) {
        val set = linkedSetOf<String>()
        red?.obj("sockBySize")?.keys()?.forEach { set.add(it) }
        db.arr("collection").objects().filter { it.str("model") == red?.str("model") }.forEach { set.add(it.str("size")) }
        red?.let { r -> db.obj("systemWeights").optJSONArray(r.str("code"))?.optJSONObject(0)?.optJSONObject("weights")?.keys()?.forEach { set.add(it) } }
        set.sortedBy { it.toDoubleOrNull() ?: Double.MAX_VALUE }
    }
    val acc = if (red != null && size.isNotBlank()) accessoryFor(db, red, size) else emptyMap()
    val bico = (acc["bico"] as? Double) ?: 0.0
    val palmilha = (acc["palmilha"] as? Double) ?: 0.0
    val meia = (acc["meia"] as? Double) ?: 0.0
    val r = right.replace(',', '.').toDoubleOrNull() ?: 0.0
    val l = left.replace(',', '.').toDoubleOrNull() ?: 0.0
    val sr = soleRight.replace(',', '.').toDoubleOrNull() ?: 0.0
    val sl = soleLeft.replace(',', '.').toDoubleOrNull() ?: 0.0
    val br = bootRight.replace(',', '.').toDoubleOrNull() ?: 0.0
    val bl = bootLeft.replace(',', '.').toDoubleOrNull() ?: 0.0
    val gross = if (type == "MONOCOLOR") r + l else br + bl
    val deduction = bico + palmilha + meia
    val net = gross - deduction
    val caneR = br - sr
    val caneL = bl - sl
    val sys = if (red != null && size.isNotBlank()) systemWeight(db, red.str("code"), size) else null
    val matrixHistoryVisible = listOf(right, left, soleRight, soleLeft, bootRight, bootLeft).all { it.isBlank() }
    val matrixCollection = red?.str("modelPrefix")?.takeIf { it.isNotBlank() } ?: red?.str("model")?.take(2).orEmpty()
    val weighedMatrices = if (red != null && size.isNotBlank()) {
        db.arr("history").objects().filter { h ->
            !h.bool("deleted") && h.str("reduced").trim() == red.str("code").trim() && h.str("size").trim() == size &&
                (h.str("modelPrefix").ifBlank { h.str("model").take(2) }) == matrixCollection
        }.map { it.str("matrix").trim() }.filter { it.isNotBlank() }.distinct().sorted()
    } else emptyList()

    ScreenColumn {
        SectionTitle("Nova pesagem", "Selecione o reduzido e a numeração. Os acessórios são calculados automaticamente.")
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = type == "MONOCOLOR", onClick = { type = "MONOCOLOR" }, label = { Text("MONOCOLOR") })
                FilterChip(selected = type == "BICOLOR", onClick = { type = "BICOLOR" }, label = { Text("BICOLOR") })
            }
            SimpleDropdown("Reduzido", reducedCode, reds.map { "${it.str("code")} · ${it.str("model")}" }, { selected -> reducedCode = selected.substringBefore(" · "); size = "" })
            SimpleDropdown("Numeração", size, sizes, { size = it }, enabled = red != null)
            OutlinedTextField(matrix, { matrix = it }, label = { Text("Número da matriz") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            if (red != null && size.isNotBlank() && matrixHistoryVisible) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Text(
                        if (weighedMatrices.isEmpty()) "Nenhuma matriz pesada registrada para esta combinação."
                        else "Matrizes já pesadas nesta coleção: ${weighedMatrices.joinToString(", ")}",
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            OutlinedTextField(red?.str("color") ?: "", {}, label = { Text("Cor") }, modifier = Modifier.fillMaxWidth(), readOnly = true)
            Text("Acessórios identificados", fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AssistChip(onClick = {}, label = { Text("${if (red?.bool("hasBico") == true) "✓" else "—"} Bico") })
                AssistChip(onClick = {}, label = { Text("${if (red?.bool("hasPalmilha") == true) "✓" else "—"} Palmilha") })
                AssistChip(onClick = {}, label = { Text("${if (red?.bool("hasMeia") == true) "✓" else "—"} Meia") })
            }
            HorizontalDivider()
            Text(if (type == "MONOCOLOR") "Peso da bota" else "Pesagem bicolor · primeiro as solas, depois as botas completas", fontWeight = FontWeight.Bold)
            if (type == "MONOCOLOR") {
                NumberField("Pé direito (kg)", right, { right = it })
                NumberField("Pé esquerdo (kg)", left, { left = it })
            } else {
                NumberField("Sola direita (kg)", soleRight, { soleRight = it })
                NumberField("Sola esquerda (kg)", soleLeft, { soleLeft = it })
                NumberField("Bota completa direita (kg)", bootRight, { bootRight = it })
                NumberField("Bota completa esquerda (kg)", bootLeft, { bootLeft = it })
                Text("Cano direito: ${fmt(caneR)} kg · Cano esquerdo: ${fmt(caneL)} kg", color = MaterialTheme.colorScheme.primary)
            }
            OutlinedTextField(notes, { notes = it }, label = { Text("Observações (opcional)") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = {
                if (red == null || size.isBlank()) { notify("Selecione o reduzido e a numeração.", true); return@Button }
                if (matrix.isBlank()) { notify("Informe o número da matriz.", true); return@Button }
                if (gross <= 0.0) { notify("Informe os pesos da pesagem.", true); return@Button }
                if (net < 0.0) { notify("O peso líquido não pode ser negativo. Confira os pesos e acessórios.", true); return@Button }
                if (type == "BICOLOR" && (caneR < 0 || caneL < 0)) { notify("O peso da bota completa deve ser maior ou igual ao peso da sola em cada lado.", true); return@Button }
                val accessories = JSONObject().put("bico", acc["bicoNum"] ?: "N").put("palmilha", acc["palmilhaNum"] ?: "N").put("meia", acc["meiaType"] ?: "N")
                val accessoryWeights = JSONObject().put("bico", bico).put("palmilha", palmilha).put("meia", meia)
                val record = JSONObject().put("id", UUID.randomUUID().toString()).put("type", type).put("createdAt", nowIso()).put("date", todayIso())
                    .put("reduced", red.str("code")).put("model", red.str("model")).put("modelPrefix", red.str("model").take(2)).put("color", red.str("color"))
                    .put("size", size).put("matrix", matrix.trim()).put("right", if (type == "MONOCOLOR") r else br).put("left", if (type == "MONOCOLOR") l else bl)
                    .put("gross", gross).put("soleRight", if (type == "BICOLOR") sr else JSONObject.NULL).put("soleLeft", if (type == "BICOLOR") sl else JSONObject.NULL)
                    .put("caneRight", if (type == "BICOLOR") caneR else JSONObject.NULL).put("caneLeft", if (type == "BICOLOR") caneL else JSONObject.NULL)
                    .put("solePair", if (type == "BICOLOR") sr + sl else JSONObject.NULL).put("accessories", accessories).put("accessoryWeights", accessoryWeights)
                    .put("deduction", deduction).put("net", net).put("systemWeight", sys ?: JSONObject.NULL).put("notes", notes.trim()).put("source", "app")
                onSave(record)
            }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Save, null); Spacer(Modifier.width(8.dp)); Text("Salvar pesagem") }
        } }
        Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Resultado calculado", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("Peso líquido do par", style = MaterialTheme.typography.labelMedium)
            Text("${fmt(if (red != null && size.isNotBlank()) net else null)} kg", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = if (net < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            HorizontalDivider()
            ResultLine("Peso bruto do par", "${fmt(gross)} kg")
            if (type == "BICOLOR") { ResultLine("Par de solas", "${fmt(sr + sl)} kg"); ResultLine("Par de canos", "${fmt(caneR + caneL)} kg") }
            ResultLine("Desconto bico", "− ${fmt(bico)} kg")
            ResultLine("Desconto palmilha", "− ${fmt(palmilha)} kg")
            ResultLine("Desconto meia", "− ${fmt(meia)} kg")
            ResultLine("Peso do sistema*", sys?.let { "${fmt(it)} kg" } ?: "Não localizado")
            Text("* Referência importada da primeira linha encontrada para o reduzido na aba PESO SISTEMA.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
    }
}

@Composable private fun ResultLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, style = MaterialTheme.typography.bodyMedium); Text(value, fontWeight = FontWeight.SemiBold) }
}

@Composable private fun HistoryScreen(db: JSONObject, revision: Int, onDelete: (String) -> Unit, onCsv: (String) -> Unit) {
    var search by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("Todos") }
    val all = db.arr("history").objects().filterNot { it.bool("deleted") }.sortedByDescending { it.str("createdAt") }
    val rows = all.filter { h ->
        (type == "Todos" || (type == "Monocolor" && h.str("type") == "MONOCOLOR") || (type == "Bicolor" && h.str("type") == "BICOLOR")) &&
            listOf(h.str("reduced"), h.str("model"), h.str("matrix"), h.str("size")).joinToString(" ").contains(search, ignoreCase = true)
    }
    ScreenColumn {
        SectionTitle("Histórico", "${rows.size} registro(s) disponíveis")
        OutlinedTextField(search, { search = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Buscar reduzido, modelo ou matriz") }, singleLine = true)
        SimpleDropdown("Tipo de pesagem", type, listOf("Todos", "Monocolor", "Bicolor"), { type = it })
        OutlinedButton(onClick = {
            val columns = listOf("date", "type", "reduced", "model", "color", "size", "matrix", "right", "left", "gross", "deduction", "net", "systemWeight", "notes")
            val csv = buildString {
                append(columns.joinToString(";")).append("\r\n")
                rows.forEach { row -> append(columns.joinToString(";") { key -> csvCell(row.opt(key)) }).append("\r\n") }
            }
            onCsv("\uFEFF$csv")
        }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.FileDownload, null); Spacer(Modifier.width(8.dp)); Text("Exportar CSV") }
        if (rows.isEmpty()) Text("Nenhum registro encontrado.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        rows.forEach { h ->
            Card { Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(h.str("reduced"), fontWeight = FontWeight.Bold)
                    AssistChip(onClick = {}, label = { Text(if (h.str("type") == "BICOLOR") "Bicolor" else "Monocolor") })
                }
                Text("${datePt(h.str("date"))} · ${h.str("model")} · Tam. ${h.str("size")}", style = MaterialTheme.typography.bodySmall)
                Text("Matriz ${h.str("matrix")} · Bruto ${fmt(h.num("gross"))} kg · Desconto ${fmt(h.num("deduction", h.obj("accessoryWeights").num("bico") + h.obj("accessoryWeights").num("palmilha") + h.obj("accessoryWeights").num("meia")))} kg", style = MaterialTheme.typography.bodySmall)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Líquido: ${fmt(h.num("net"))} kg", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    if (h.str("source") != "planilha") TextButton(onClick = { onDelete(h.str("id")) }) { Icon(Icons.Default.Delete, null); Text("Excluir") }
                    else Text("Importado da planilha", style = MaterialTheme.typography.labelSmall)
                }
                if (h.str("notes").isNotBlank()) Text("Obs.: ${h.str("notes")}", style = MaterialTheme.typography.bodySmall)
            } }
        }
    }
}

private fun csvCell(value: Any?): String {
    val raw = when (value) {
        null, JSONObject.NULL -> ""
        is Number -> value.toString().replace('.', ',')
        else -> value.toString()
    }
    return "\"${raw.replace("\"", "\"\"")}\""
}

@Composable private fun MatricesScreen(db: JSONObject, revision: Int, onChange: (String) -> Unit) {
    var model by remember { mutableStateOf("") }
    var size by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    val models = (db.arr("reduced").objects().map { it.str("modelPrefix").ifBlank { it.str("model").take(2) } } + db.arr("matrices").objects().map { it.str("model") }).filter(String::isNotBlank).distinct().sorted()
    val matrices = db.arr("matrices").objects().filter { listOf(it.str("model"), it.str("size"), it.str("code")).joinToString(" ").contains(search, true) }
    val sizesForModel = (db.arr("collection").objects().filter { it.str("model") == model }.map { it.str("size") } + db.arr("reduced").objects().filter { it.str("modelPrefix").ifBlank { it.str("model").take(2) } == model }.flatMap { it.obj("sockBySize").keys().asSequence().toList() }).distinct().sortedBy { it.toDoubleOrNull() ?: Double.MAX_VALUE }
    ScreenColumn {
        SectionTitle("Matrizaria", "Cadastro e consulta de matrizes por coleção e numeração")
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Cadastrar matriz", fontWeight = FontWeight.Bold)
            SimpleDropdown("Coleção / modelo", model, models, { model = it })
            SimpleDropdown("Numeração", size, sizesForModel, { size = it }, enabled = model.isNotBlank())
            OutlinedTextField(code, { code = it }, label = { Text("Número da matriz") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Button(onClick = {
                if (model.isBlank() || size.isBlank() || code.isBlank()) { onChange("Preencha coleção, numeração e matriz."); return@Button }
                val exists = db.arr("matrices").objects().any { it.str("model") == model && it.str("size") == size && it.str("code").equals(code, true) }
                if (exists) { onChange("Esta matriz já está cadastrada para o modelo e tamanho."); return@Button }
                db.arr("matrices").put(JSONObject().put("id", UUID.randomUUID().toString()).put("model", model).put("collection", model).put("size", size).put("code", code.trim()).put("createdAt", nowIso()).put("source", "app"))
                model = ""; size = ""; code = ""; onChange("Matriz cadastrada.")
            }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Text("Cadastrar matriz") }
        } }
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Resumo da coleção importada", fontWeight = FontWeight.Bold)
            Text("Quantidades da aba COLEÇÃO", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            db.arr("collection").objects().forEach { item -> ResultLine("Modelo ${item.str("model")} · Tam. ${item.str("size")} (${item.str("line")})", "${item.optInt("quantity")} un.") }
        } }
        OutlinedTextField(search, { search = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Buscar coleção, numeração ou matriz") }, singleLine = true)
        Text("${matrices.size} matriz(es)", style = MaterialTheme.typography.labelMedium)
        matrices.forEach { m ->
            val uses = db.arr("history").objects().filter { !it.bool("deleted") && it.str("modelPrefix").ifBlank { it.str("model").take(2) } == m.str("model") && it.str("size") == m.str("size") && it.str("matrix") == m.str("code") }
            val last = uses.maxByOrNull { it.str("createdAt") }
            Card { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Coleção ${m.str("collection", m.str("model"))} · Tam. ${m.str("size")}", style = MaterialTheme.typography.bodySmall); Text(if (m.str("source") == "historico") "Histórico" else "App", style = MaterialTheme.typography.labelSmall) }
                Text("Matriz ${m.str("code")}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("${uses.size} utilização(ões) · Última: ${last?.let { datePt(it.str("date")) } ?: "—"}", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = {
                    val updated = JSONArray(db.arr("matrices").objects().filterNot { it.str("id") == m.str("id") })
                    db.put("matrices", updated); onChange("Matriz removida do cadastro. Os registros de pesagem foram preservados.")
                }) { Icon(Icons.Default.Delete, null); Text("Excluir cadastro") }
            } }
        }
        if (matrices.isEmpty()) Text("Nenhuma matriz cadastrada para esta busca.")
    }
}

@Composable private fun RegistrationsScreen(db: JSONObject, revision: Int, onChange: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    var model by remember { mutableStateOf("") }
    var color by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("MONOCOLOR") }
    var hasBico by remember { mutableStateOf(false) }
    var hasPalmilha by remember { mutableStateOf(false) }
    var hasMeia by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    val reduced = db.arr("reduced").objects().sortedBy { it.str("code") }.filter { listOf(it.str("code"), it.str("model"), it.str("color")).joinToString(" ").contains(search, true) }
    val tables = db.obj("accessoryTables")
    ScreenColumn {
        SectionTitle("Cadastros", "Configuração de reduzidos e consulta das tabelas de acessórios")
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Cadastrar reduzido", fontWeight = FontWeight.Bold)
            OutlinedTextField(code, { code = it }, label = { Text("Código do reduzido") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(model, { model = it }, label = { Text("Modelo (ex.: 85BPL600)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(color, { color = it }, label = { Text("Cor") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            SimpleDropdown("Tipo de pesagem", if (type == "MONOCOLOR") "Monocolor" else "Bicolor", listOf("Monocolor", "Bicolor"), { type = if (it == "Monocolor") "MONOCOLOR" else "BICOLOR" })
            Text("Acessórios", fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(hasBico, { hasBico = it }); Text("Bico"); Spacer(Modifier.width(12.dp)); Checkbox(hasPalmilha, { hasPalmilha = it }); Text("Palmilha") }
            Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(hasMeia, { hasMeia = it }); Text("Meia") }
            Button(onClick = {
                val trimmed = code.trim(); val m = model.trim()
                if (trimmed.isBlank() || m.isBlank()) { onChange("Informe o código do reduzido e o modelo."); return@Button }
                if (db.arr("reduced").objects().any { it.str("code") == trimmed }) { onChange("Este reduzido já está cadastrado."); return@Button }
                db.arr("reduced").put(JSONObject().put("code", trimmed).put("model", m).put("color", color.trim()).put("type", type).put("hasBico", hasBico).put("hasPalmilha", hasPalmilha).put("hasMeia", hasMeia).put("sockBySize", JSONObject()).put("modelPrefix", m.take(2)).put("source", "app"))
                code = ""; model = ""; color = ""; hasBico = false; hasPalmilha = false; hasMeia = false; onChange("Reduzido cadastrado.")
            }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Save, null); Text("Salvar reduzido") }
        } }
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Base de acessórios", fontWeight = FontWeight.Bold)
            Text("Pesos padrão importados da planilha. Nesta versão, as tabelas são consultadas, não editadas.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            listOf("bico" to "Bico", "palmilha" to "Palmilha", "meia" to "Meia").forEach { (key, label) ->
                Text(label, fontWeight = FontWeight.SemiBold)
                val table = tables.obj(key)
                table.keys().asSequence().toList().sorted().forEach { k -> ResultLine("$k", "${fmt(table.num(k))} kg") }
            }
        } }
        SectionTitle("Reduzidos cadastrados", "${reduced.size} configuração(ões)")
        OutlinedTextField(search, { search = it }, label = { Text("Buscar código, modelo ou cor") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        reduced.forEach { r -> Card { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(r.str("code"), fontWeight = FontWeight.Bold)
            Text("${r.str("model")} · ${r.str("color")}", style = MaterialTheme.typography.bodySmall)
            Text("Bico: ${if (r.bool("hasBico")) "Sim" else "Não"} · Palmilha: ${if (r.bool("hasPalmilha")) "Sim" else "Não"} · Meia: ${if (r.bool("hasMeia")) "Sim" else "Não"}", style = MaterialTheme.typography.bodySmall)
            Text(if (r.str("source") == "planilha") "Origem: Planilha" else "Origem: Aplicativo", style = MaterialTheme.typography.labelSmall)
        } } }
    }
}

@Composable private fun ReportsScreen(db: JSONObject, revision: Int, onCsv: (String) -> Unit) {
    var type by remember { mutableStateOf("Todos") }
    var reduced by remember { mutableStateOf("Todos") }
    var size by remember { mutableStateOf("") }
    val all = db.arr("history").objects().filterNot { it.bool("deleted") }
    val codes = all.map { it.str("reduced") }.distinct().sorted()
    val filtered = all.filter { h ->
        (type == "Todos" || (type == "Monocolor" && h.str("type") == "MONOCOLOR") || (type == "Bicolor" && h.str("type") == "BICOLOR")) &&
            (reduced == "Todos" || h.str("reduced") == reduced) && (size.isBlank() || h.str("size") == size.trim())
    }
    data class Group(val type: String, val reduced: String, val model: String, val size: String, val matrix: String, val count: Int, val avg: Double, val system: Double?, val diff: Double?)
    val groups = filtered.groupBy { listOf(it.str("type"), it.str("reduced"), it.str("model"), it.str("size"), it.str("matrix")).joinToString("|") }
        .values.map { g ->
            val avg = g.map { it.num("net") }.average()
            val system = g.firstOrNull { !it.isNull("systemWeight") }?.optDouble("systemWeight")
            Group(g.first().str("type"), g.first().str("reduced"), g.first().str("model"), g.first().str("size"), g.first().str("matrix"), g.size, avg, system, system?.let { avg - it })
        }.sortedWith(compareBy<Group> { it.reduced }.thenBy { it.size.toDoubleOrNull() ?: 0.0 }.thenBy { it.matrix })
    val avgAll = if (filtered.isEmpty()) null else filtered.map { it.num("net") }.average()
    val distinctMatrices = filtered.map { "${it.str("model")}|${it.str("size")}|${it.str("matrix")}" }.toSet().size

    ScreenColumn {
        SectionTitle("Relatórios", "Consumo médio por matriz, mantendo cada matriz separada")
        SimpleDropdown("Tipo", type, listOf("Todos", "Monocolor", "Bicolor"), { type = it })
        SimpleDropdown("Reduzido", reduced, listOf("Todos") + codes, { reduced = it })
        OutlinedTextField(size, { size = it }, label = { Text("Numeração (opcional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("Pesagens", filtered.size.toString(), modifier = Modifier.weight(1f))
            MetricCard("Média líquida", avgAll?.let { fmt(it) } ?: "—", "kg por par", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("Matrizes distintas", distinctMatrices.toString(), modifier = Modifier.weight(1f))
            MetricCard("Grupos", groups.size.toString(), "Analisados", Modifier.weight(1f))
        }
        OutlinedButton(onClick = {
            val csv = buildString {
                append("tipo;reduzido;modelo;numeração;matriz;pesagens;média_líquida;peso_sistema;diferença\r\n")
                groups.forEach { g ->
                    val values = listOf(if (g.type == "BICOLOR") "Bicolor" else "Monocolor", g.reduced, g.model, g.size, g.matrix, g.count.toString(), fmt(g.avg), g.system?.let { fmt(it) } ?: "", g.diff?.let { fmt(it) } ?: "")
                    append(values.joinToString(";") { csvCell(it) }).append("\r\n")
                }
            }
            onCsv("\uFEFF$csv")
        }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.FileDownload, null); Spacer(Modifier.width(8.dp)); Text("Exportar relatório CSV") }
        groups.forEach { g -> Card { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(g.reduced, fontWeight = FontWeight.Bold); Text(if (g.type == "BICOLOR") "Bicolor" else "Monocolor", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
            Text("${g.model} · Tam. ${g.size} · Matriz ${g.matrix}", style = MaterialTheme.typography.bodySmall)
            ResultLine("Pesagens", g.count.toString())
            ResultLine("Média líquida", "${fmt(g.avg)} kg")
            ResultLine("Peso do sistema", g.system?.let { "${fmt(it)} kg" } ?: "—")
            ResultLine("Diferença", g.diff?.let { "${if (it > 0) "+" else ""}${fmt(it)} kg" } ?: "—")
        } } }
        if (groups.isEmpty()) Text("Não há pesagens para os filtros selecionados.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Observação: o peso do sistema reproduz a primeira correspondência encontrada para o reduzido na aba PESO SISTEMA da planilha original.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable private fun BasesScreen(
    repo: DbRepository,
    revision: Int,
    onChange: (String) -> Unit,
    onExport: () -> Unit,
    onImport: () -> Unit,
    onCreateBase: (String) -> Unit
) {
    var selected by remember(revision) { mutableStateOf(repo.activeId) }
    var newName by remember { mutableStateOf("") }
    var showNew by remember { mutableStateOf(false) }
    var showSwitchConfirm by remember { mutableStateOf(false) }
    val active = repo.bases.firstOrNull { it.id == repo.activeId }
    val activeDb = repo.database
    val historyCount = activeDb.arr("history").objects().count { !it.bool("deleted") }
    val reducedCount = activeDb.arr("reduced").length()
    val matrixCount = activeDb.arr("matrices").length()

    if (showSwitchConfirm) AlertDialog(
        onDismissRequest = { showSwitchConfirm = false },
        title = { Text("Trocar de base?") },
        text = { Text("A base atual será salva automaticamente. Os dados não serão misturados.") },
        confirmButton = { TextButton(onClick = {
            try { repo.activate(selected); onChange("Base alterada com sucesso.") } catch (e: Exception) { onChange(e.message ?: "Não foi possível trocar de base.") }
            showSwitchConfirm = false
        }) { Text("Trocar") } },
        dismissButton = { TextButton(onClick = { showSwitchConfirm = false }) { Text("Cancelar") } }
    )
    if (showNew) AlertDialog(
        onDismissRequest = { showNew = false },
        title = { Text("Criar base nova") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("A nova base terá os cadastros e tabelas padrão, mas começará sem histórico de pesagens."); OutlinedTextField(newName, { newName = it }, label = { Text("Nome da base") }, singleLine = true) } },
        confirmButton = { TextButton(onClick = { if (newName.isNotBlank()) onCreateBase(newName.trim()); showNew = false; newName = "" }) { Text("Criar") } },
        dismissButton = { TextButton(onClick = { showNew = false }) { Text("Cancelar") } }
    )

    ScreenColumn {
        SectionTitle("Bases de dados", "Bases independentes neste dispositivo e transferência por JSON")
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Base atualmente em uso", fontWeight = FontWeight.Bold); AssistChip(onClick = {}, label = { Text("Ativa") }) }
            Text(active?.name ?: "Base principal", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("$historyCount pesagens · $reducedCount reduzidos · $matrixCount matrizes", style = MaterialTheme.typography.bodySmall)
            Text("Armazenamento local no aplicativo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Trocar de base", fontWeight = FontWeight.Bold)
            SimpleDropdown("Base disponível", repo.bases.firstOrNull { it.id == selected }?.name ?: "", repo.bases.map { it.name }, { name -> selected = repo.bases.firstOrNull { it.name == name }?.id ?: repo.activeId }, enabled = repo.bases.size > 1)
            Button(onClick = { if (selected != repo.activeId) showSwitchConfirm = true else onChange("Esta base já está em uso.") }, enabled = repo.bases.size > 1, modifier = Modifier.fillMaxWidth()) { Text("Usar esta base") }
            Text("Trocar de base não mistura nem apaga os dados. Cada base mantém seu próprio histórico, reduzidos, matrizes e configurações.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Transferir para outro responsável", fontWeight = FontWeight.Bold)
            Text("Exporte a base completa e envie o arquivo para a pessoa que assumirá o aplicativo. A importação cria uma base separada e preserva a atual.", style = MaterialTheme.typography.bodySmall)
            Button(onClick = onExport, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.FileUpload, null); Spacer(Modifier.width(8.dp)); Text("Exportar base completa (JSON)") }
            OutlinedButton(onClick = onImport, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.FileDownload, null); Spacer(Modifier.width(8.dp)); Text("Importar JSON como nova base") }
            Text("O arquivo inclui histórico, reduzidos, matrizes, coleções e tabelas de peso. O formato é compatível com a versão Web 0.1.6.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) { SectionTitle("Bases neste dispositivo", "${repo.bases.size} base(s)"); TextButton(onClick = { showNew = true }) { Icon(Icons.Default.Add, null); Text("Nova base") } }
        repo.bases.sortedByDescending { it.id == repo.activeId }.forEach { b ->
            val raw = repo.baseDatabase(b.id)
            val count = raw.arr("history").objects().count { !it.bool("deleted") }
            Card { Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(b.name, fontWeight = FontWeight.Bold); Text(if (b.id == repo.activeId) "Em uso" else "Disponível", color = if (b.id == repo.activeId) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium) }
                Text("$count pesagem(ns) · Atualizada ${b.updatedAt.take(16).replace('T', ' ')}", style = MaterialTheme.typography.bodySmall)
                Text("Armazenamento: este dispositivo", style = MaterialTheme.typography.labelSmall)
            } }
        }
    }
}
