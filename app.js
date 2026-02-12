
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTrVEMf_DG702fbz5Gy12__YvNYc1lNXTW-gFcZbV5J0NSndYYvjQb_HmjsEWImsZBLAEZqlTs9eLDh/pub?gid=1956008952&single=true&output=csv";

/**
 * SCRIPT_URL = endpoint Apps Script Web App (WRITE)
 * Ini URL dari Deploy -> Web App (akses Anyone)
 * Contoh:
 * https://script.google.com/macros/s/AKfycbxxxxxx/exec
 */
const SCRIPT_URL = "PASTE_WEB_APP_URL_KAMU_DI_SINI";


// ============================================================
// (B) HELPER DOM & STATE
// ============================================================

/** Shortcut ambil element by id */
const $ = (id) => document.getElementById(id);

/**
 * masterRows = hasil parsing CSV master data
 * Bentuk array of object:
 * [
 *   { channel: "CH 0 - CELL 1", machine: "RDM", name: "Face Grinding 1" },
 *   ...
 * ]
 */
let masterRows = [];

/**
 * step1Data = data yang dipilih user di Step 1
 * Disimpan untuk dipakai Step 2 dan payload submit
 */
let step1Data = null;


// ============================================================
// (C) CSV PARSER (support quoted CSV)
// ============================================================

/**
 * parseCSV(text)
 * - Input: text CSV mentah (string)
 * - Output: array of row, tiap row array of cell string
 *   [
 *     ["Channel","Machine","Name"],
 *     ["CH 0 - CELL 1","RDM","Face Grinding 1"],
 *     ...
 *   ]
 */
function parseCSV(text) {
  const out = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    // handle double quote dalam CSV
    if (ch === '"') {
      // escape quote: "" dianggap "
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    // separator kolom
    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    // new line (akhir row)
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some(c => c.trim() !== "")) out.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  // last row
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some(c => c.trim() !== "")) out.push(row);
  }

  return out;
}

/** uniq array helper */
const uniq = (arr) => Array.from(new Set(arr));


// ============================================================
// (D) UI CONTROL: Step show/hide + default date
// ============================================================

function setToday() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  $("tanggal").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** tampilkan step 1 atau step 2 */
function showStep(n) {
  $("step1").classList.toggle("hidden", n !== 1);
  $("step2").classList.toggle("hidden", n !== 2);
  if ($("msg")) $("msg").textContent = "";
}


// ============================================================
// (E) RENDER OPTIONS: Channel & Machine dropdown
// ============================================================

function setChannelOptions(channels) {
  $("channel").innerHTML =
    `<option value="">Pilih Channel</option>` +
    channels.map(c => `<option value="${c}">${c}</option>`).join("");
}

function setMachineOptions(machines) {
  $("machine").innerHTML =
    `<option value="">Pilih Machine</option>` +
    machines.map(m => `<option value="${m}">${m}</option>`).join("");
}


// ============================================================
// (F) VALIDASI STEP 1
// ============================================================

/**
 * vStep1()
 * - Return null jika tidak valid
 * - Return object jika valid:
 *   { tanggal, shift, npk, channel, machine }
 */
function vStep1() {
  const tanggal = $("tanggal").value.trim();
  const shift = $("shift").value.trim();
  const npk = $("npk").value.trim();
  const channel = $("channel").value.trim();
  const machineVisible = !$("machineWrap").classList.contains("hidden");
  const machine = $("machine").value.trim();

  // show/hide error message
  $("err-tanggal").classList.toggle("hidden", !!tanggal);
  $("err-shift").classList.toggle("hidden", !!shift);
  $("err-npk").classList.toggle("hidden", !!npk);
  $("err-channel").classList.toggle("hidden", !!channel);
  if (machineVisible) $("err-machine").classList.toggle("hidden", !!machine);

  if (!tanggal || !shift || !npk || !channel) return null;
  if (machineVisible && !machine) return null;

  return { tanggal, shift, npk, channel, machine };
}


// ============================================================
// (G) STEP 2: generate list master berdasarkan Channel
// ============================================================

/**
 * renderMasterList(channel)
 *
 * Sumber list master:
 * - masterRows[] dari CSV
 * - filter: r.channel === channel
 *
 * item yang ditampilkan:
 * - title = Name (kolom C)
 * - code  = Machine (kolom B)  <-- sementara dipakai untuk teks dalam kurung
 *
 * NOTE:
 * Kalau kamu punya kolom code terpisah di sheet master,
 * nanti tinggal ubah mapping di sini.
 */
function renderMasterList(channel) {
  const list = $("masterList");
  list.innerHTML = "";

  const items = masterRows
    .filter(r => r.channel === channel)
    .map((r, idx) => ({
      id: `m${idx}`,
      title: r.name || "-",
      code: r.machine || "-" // sementara
    }));

  $("infoChannel").textContent = channel;
  $("infoTotal").textContent = String(items.length);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl shadow p-5";
    card.dataset.itemid = it.id;

    card.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="text-lg font-semibold text-slate-900">
          ${i + 1}. ${it.title} <span class="text-slate-500">(${it.code})</span>
        </div>

        <div class="flex gap-2 shrink-0">
          <button type="button" data-action="ok" data-id="${it.id}"
            class="px-4 py-2 rounded-lg border border-green-600 text-green-700 font-semibold hover:bg-green-50">
            OK
          </button>
          <button type="button" data-action="ng" data-id="${it.id}"
            class="px-4 py-2 rounded-lg border border-red-600 text-red-700 font-semibold hover:bg-red-50">
            NG
          </button>
        </div>
      </div>

      <div id="ngBox-${it.id}" class="hidden mt-4">
        <div class="font-semibold text-slate-900 mb-2">Jenis Remark</div>

        <div class="flex flex-col sm:flex-row gap-4">
          <label class="flex items-center gap-2">
            <input type="radio" name="remarkType-${it.id}" value="Perubahan nilai pada master" class="accent-blue-700">
            <span>Perubahan nilai pada master</span>
          </label>

          <label class="flex items-center gap-2">
            <input type="radio" name="remarkType-${it.id}" value="Lainnya: Keterangan" class="accent-blue-700">
            <span>Lainnya: Keterangan</span>
          </label>
        </div>

        <textarea id="remark-${it.id}" rows="3"
          class="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="Remark hanya boleh diisi jika ada perubahan nilai numerik pada master"></textarea>

        <p id="err-${it.id}" class="hidden text-sm text-red-600 mt-2">
          Jika NG: pilih jenis remark dan isi remark.
        </p>
      </div>
    `;

    list.appendChild(card);
  }

  // Pasang event click untuk tombol OK / NG
  list.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action; // "ok" / "ng"
      const id = btn.dataset.id;

      const okBtn = list.querySelector(`button[data-action="ok"][data-id="${id}"]`);
      const ngBtn = list.querySelector(`button[data-action="ng"][data-id="${id}"]`);
      const card = okBtn.closest(".bg-white");

      if (action === "ok") {
        card.dataset.status = "OK";

        okBtn.classList.add("bg-green-600", "text-white");
        okBtn.classList.remove("text-green-700");
        ngBtn.classList.remove("bg-red-600", "text-white");
        ngBtn.classList.add("text-red-700");

        // hide NG box + clear inputs
        $("ngBox-" + id).classList.add("hidden");
        document.querySelectorAll(`input[name="remarkType-${id}"]`).forEach(r => r.checked = false);
        $("remark-" + id).value = "";
        $("err-" + id).classList.add("hidden");
      } else {
        card.dataset.status = "NG";

        ngBtn.classList.add("bg-red-600", "text-white");
        ngBtn.classList.remove("text-red-700");
        okBtn.classList.remove("bg-green-600", "text-white");
        okBtn.classList.add("text-green-700");

        // show NG box
        $("ngBox-" + id).classList.remove("hidden");
      }
    });
  });

  return items;
}


// ============================================================
// (H) VALIDASI STEP 2 + collect details payload
// ============================================================

function validateStep2(items) {
  let ok = true;

  for (const it of items) {
    const card = Array.from($("masterList").children).find(c => c.dataset.itemid === it.id);
    const status = (card?.dataset.status || ""); // OK / NG / ""

    // wajib pilih OK/NG
    if (!status) ok = false;

    // jika NG, remarkType dan remark wajib
    if (status === "NG") {
      const rt = document.querySelector(`input[name="remarkType-${it.id}"]:checked`);
      const remark = $("remark-" + it.id).value.trim();
      const bad = !rt || !remark;
      $("err-" + it.id).classList.toggle("hidden", !bad);
      if (bad) ok = false;
    } else {
      $("err-" + it.id).classList.add("hidden");
    }
  }

  return ok;
}

/**
 * collectDetails(items)
 * output:
 * [
 *   { master, code, status, remarkType, remark },
 *   ...
 * ]
 */
function collectDetails(items) {
  const details = [];
  for (const it of items) {
    const card = Array.from($("masterList").children).find(c => c.dataset.itemid === it.id);
    const status = (card?.dataset.status || "");

    let remarkType = "";
    let remark = "";

    if (status === "NG") {
      remarkType = document.querySelector(`input[name="remarkType-${it.id}"]:checked`)?.value || "";
      remark = $("remark-" + it.id).value.trim();
    }

    details.push({
      master: it.title,
      code: it.code,
      status,
      remarkType,
      remark
    });
  }
  return details;
}


// ============================================================
// (I) INIT: Load master CSV, setup dropdown
// ============================================================

async function init() {
  setToday();
  $("status").textContent = "Mengambil master dari Google Sheets...";

  try {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const csvText = await res.text();
    const table = parseCSV(csvText);

    /**
     * table[0] adalah header CSV: Channel, Machine, Name
     * table.slice(1) = data
     *
     * mapping:
     * r[0] -> channel
     * r[1] -> machine
     * r[2] -> name
     */
    masterRows = table.slice(1).map(r => ({
      channel: (r[0] || "").trim(),
      machine: (r[1] || "").trim(),
      name: (r[2] || "").trim(),
    })).filter(r => r.channel && r.machine);

    // isi dropdown channel (unik)
    const channels = uniq(masterRows.map(r => r.channel)).sort();
    setChannelOptions(channels);

    $("status").textContent = `Loaded ${masterRows.length} baris master.`;
  } catch (err) {
    console.error(err);
    $("status").textContent = "Gagal load master (cek publish CSV / internet).";
    $("channel").innerHTML = `<option value="">Gagal load</option>`;
  }
}


// ============================================================
// (J) EVENT LISTENERS
// ============================================================

// Saat user pilih Channel -> tampilkan Machine dropdown sesuai channel tsb
$("channel").addEventListener("change", () => {
  const ch = $("channel").value;

  // reset
  $("machineWrap").classList.add("hidden");
  $("nameWrap").classList.add("hidden");
  $("name").value = "";

  if (!ch) return;

  const machines = uniq(
    masterRows.filter(r => r.channel === ch).map(r => r.machine)
  ).sort();

  setMachineOptions(machines);
  $("machineWrap").classList.remove("hidden");
});

// Saat user pilih Machine -> isi field Name (kolom Name dari CSV)
$("machine").addEventListener("change", () => {
  const ch = $("channel").value;
  const mc = $("machine").value;

  $("nameWrap").classList.add("hidden");
  $("name").value = "";

  if (!ch || !mc) return;

  const found = masterRows.find(r => r.channel === ch && r.machine === mc);
  if (found) {
    $("name").value = found.name || "-";
    $("nameWrap").classList.remove("hidden");
  }
});

// Tombol NEXT: pindah ke step 2
$("btnNext").addEventListener("click", () => {
  const data = vStep1();
  if (!data) return;

  step1Data = data;

  // tampilkan meta info di step2
  $("infoMeta").textContent =
    `Tanggal: ${data.tanggal} • Shift: ${data.shift} • NPK: ${data.npk} • Machine: ${data.machine}`;

  const items = renderMasterList(data.channel);
  window.__items = items; // simpan list item untuk submit

  showStep(2);
});

// Tombol Back: kembali step 1
$("btnBack").addEventListener("click", () => showStep(1));

// Tombol Submit Step2: kirim ke Apps Script
$("btnSubmit").addEventListener("click", async () => {
  const items = window.__items || [];
  $("msg").textContent = "";

  if (!items.length) {
    $("msg").textContent = "Tidak ada master untuk disubmit.";
    $("msg").className = "text-sm text-center mt-3 text-red-600";
    return;
  }

  if (!validateStep2(items)) {
    $("msg").textContent = "Lengkapi OK/NG. Jika NG wajib isi remark.";
    $("msg").className = "text-sm text-center mt-3 text-red-600";
    return;
  }

  // ===== payload yang dikirim ke Apps Script =====
  const payload = {
    header: step1Data,
    details: collectDetails(items)
  };

  // cek isi payload di console
  console.log("SUBMIT PAYLOAD:", payload);

  try {
    $("btnSubmit").disabled = true;
    $("btnSubmit").textContent = "Menyimpan...";

    await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    $("msg").textContent = "✅ Berhasil disimpan ke Google Sheets!";
    $("msg").className = "text-sm text-center mt-3 text-green-600";
  } catch (err) {
    console.error(err);
    $("msg").textContent = "❌ Gagal simpan (cek SCRIPT_URL / Apps Script).";
    $("msg").className = "text-sm text-center mt-3 text-red-600";
  } finally {
    $("btnSubmit").disabled = false;
    $("btnSubmit").textContent = "Submit & Simpan";
  }
});

init();