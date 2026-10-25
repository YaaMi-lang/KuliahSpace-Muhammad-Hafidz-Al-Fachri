
const SUPABASE_URL = "https://yzpuwhrxatteahtkjruk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_TbCxko3x695wX1Lz0YTC1Q_dFBzKe5K";

const ADMIN_UID = "c39ae790-cc7b-4884-89a2-65879e5201e8";
const BUCKET_NAME = "kuliahspace-files";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (selector) => document.querySelector(selector);

let resources = [];
let currentUser = null;
let toastTimeout;

const allowedExtensions = [
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "txt", "zip", "jpg", "jpeg", "png"
];

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "image/jpeg",
  "image/png"
];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function showToast(message, isError = false) {
  const toast = $("#toast");

  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function setStatus(selector, message, isError = false) {
  const element = $(selector);

  element.textContent = message;
  element.style.color = isError ? "#f87171" : "";
}

function formatDate(dateString) {
  if (!dateString) return "-";

  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getFileExtension(filename = "") {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function getFileIcon(filename = "") {
  const extension = getFileExtension(filename);

  if (["pdf"].includes(extension)) return "PDF";
  if (["doc", "docx"].includes(extension)) return "DOC";
  if (["ppt", "pptx"].includes(extension)) return "PPT";
  if (["xls", "xlsx"].includes(extension)) return "XLS";
  if (["zip"].includes(extension)) return "ZIP";
  if (["jpg", "jpeg", "png"].includes(extension)) return "IMG";

  return "TXT";
}

function getPublicFileUrl(filePath) {
  const result = db.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return result.data.publicUrl;
}

function isAdmin() {
  return Boolean(currentUser && currentUser.id === ADMIN_UID);
}

function updateAdminInterface() {
  const adminSection = $("#admin-section");
  const adminButton = $("#open-admin");

  adminSection.classList.toggle("hidden", !isAdmin());

  adminButton.textContent = isAdmin() ? "Panel Admin" : "Login Admin";

  if (isAdmin()) {
    renderAdminResources();
  } else {
    $("#admin-resource-list").replaceChildren();
  }
}

async function loadResources() {
  setStatus("#resource-status", "Memuat daftar dokumen...");

  const { data, error } = await db
    .from("resources")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("Gagal memuat dokumen:", error);
    setStatus(
      "#resource-status",
      "Gagal memuat dokumen. Periksa koneksi Supabase dan pengaturan tabel.",
      true
    );
    $("#resource-list").replaceChildren();
    $("#total-resources").textContent = "0";
    return;
  }

  resources = data || [];

  $("#total-resources").textContent = resources.length;
  updateCourseOptions();
  renderResources();
  renderAdminResources();
}

function updateCourseOptions() {
  const select = $("#course-filter");
  const selectedValue = select.value;

  const courses = [...new Set(
    resources
      .map((resource) => resource.course)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "id"));

  select.innerHTML = '<option value="">Semua mata kuliah</option>';

  courses.forEach((course) => {
    const option = document.createElement("option");
    option.value = course;
    option.textContent = course;
    select.appendChild(option);
  });

  if (courses.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function renderResources() {
  const container = $("#resource-list");
  const searchTerm = $("#search-input").value.trim().toLowerCase();
  const selectedType = $("#type-filter").value;
  const selectedCourse = $("#course-filter").value;

  const filteredResources = resources.filter((resource) => {
    const searchableText = [
      resource.title,
      resource.course,
      resource.description,
      resource.original_filename
    ].join(" ").toLowerCase();

    const matchesSearch = searchableText.includes(searchTerm);
    const matchesType = !selectedType ||
      resource.resource_type === selectedType;
    const matchesCourse = !selectedCourse ||
      resource.course === selectedCourse;

    return matchesSearch && matchesType && matchesCourse;
  });

  if (filteredResources.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Belum ada dokumen yang cocok</strong>
        <span>Coba kata kunci atau filter yang berbeda.</span>
      </div>
    `;

    setStatus(
      "#resource-status",
      resources.length === 0
        ? "Belum ada materi atau tugas yang diunggah."
        : `${filteredResources.length} dokumen ditemukan.`
    );

    return;
  }

  setStatus(
    "#resource-status",
    `Menampilkan ${filteredResources.length} dari ${resources.length} dokumen.`
  );

  container.innerHTML = filteredResources.map((resource) => {
    const fileUrl = getPublicFileUrl(resource.file_path);
    const typeClass = resource.resource_type === "Tugas"
      ? "assignment"
      : "";

    return `
      <article class="resource-card">
        <div class="resource-card-top">
          <span class="file-icon">${escapeHTML(
            getFileIcon(resource.original_filename)
          )}</span>
          <span class="type-tag ${typeClass}">
            ${escapeHTML(resource.resource_type)}
          </span>
        </div>

        <h3>${escapeHTML(resource.title)}</h3>
        <p class="resource-course">${escapeHTML(resource.course)}</p>

        <p class="resource-description">${
          escapeHTML(resource.description || "Tidak ada deskripsi.")
        }</p>

        <p class="resource-meta">
          ${escapeHTML(resource.original_filename)} ·
          ${escapeHTML(formatDate(resource.uploaded_at))}
        </p>

        <a
          class="download-link"
          href="${escapeHTML(fileUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          ↓ Lihat / Unduh Dokumen
        </a>
      </article>
    `;
  }).join("");
}

function renderAdminResources() {
  const container = $("#admin-resource-list");

  if (!isAdmin()) {
    container.replaceChildren();
    return;
  }

  if (resources.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <strong>Belum ada dokumen</strong>
        <span>Dokumen yang kamu unggah akan muncul di sini.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = resources.map((resource) => `
    <div class="admin-resource-row">
      <div>
        <h4>${escapeHTML(resource.title)}</h4>
        <p>
          ${escapeHTML(resource.course)} ·
          ${escapeHTML(resource.resource_type)}
        </p>
      </div>

      <button
        class="delete-button"
        type="button"
        data-delete-id="${Number(resource.id)}"
      >
        Hapus
      </button>
    </div>
  `).join("");
}

async function handleLogin(event) {
  event.preventDefault();

  const email = $("#admin-email").value.trim();
  const password = $("#admin-password").value;
  const button = $("#login-button");

  button.disabled = true;
  button.textContent = "Memeriksa...";
  setStatus("#login-status", "");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    if (!isAdmin()) {
      await db.auth.signOut();
      currentUser = null;

      throw new Error("Akun ini tidak memiliki akses admin KuliahSpace.");
    }

    $("#login-dialog").close();
    $("#login-form").reset();

    updateAdminInterface();
    showToast("Login admin berhasil!");

    $("#admin-section").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error("Login gagal:", error);
    setStatus(
      "#login-status",
      error.message || "Login gagal. Periksa email dan password.",
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Masuk";
  }
}

async function handleLogout() {
  const { error } = await db.auth.signOut();

  if (error) {
    showToast("Gagal keluar. Silakan coba lagi.", true);
    return;
  }

  currentUser = null;
  updateAdminInterface();
  showToast("Kamu sudah keluar dari panel admin.");
}

async function handleUpload(event) {
  event.preventDefault();

  if (!isAdmin()) {
    showToast("Silakan login sebagai admin terlebih dahulu.", true);
    return;
  }

  const form = $("#upload-form");
  const submitButton = $("#upload-button");
  const fileInput = $("#resource-file");
  const file = fileInput.files[0];

  if (!file) {
    setStatus("#upload-status", "Pilih file terlebih dahulu.", true);
    return;
  }

  const extension = getFileExtension(file.name);

  if (!allowedExtensions.includes(extension)) {
    setStatus(
      "#upload-status",
      "Format file tidak didukung. Gunakan PDF, Office, TXT, ZIP, JPG, atau PNG.",
      true
    );
    return;
  }

  if (file.type && !allowedMimeTypes.includes(file.type)) {
    setStatus(
      "#upload-status",
      "Tipe file tidak didukung. Periksa format file yang dipilih.",
      true
    );
    return;
  }

  // Batas awal 25 MB agar proses upload lebih mudah dikelola.
  if (file.size > 25 * 1024 * 1024) {
    setStatus(
      "#upload-status",
      "Ukuran file terlalu besar. Batas upload website ini 25 MB.",
      true
    );
    return;
  }

  const title = $("#resource-title").value.trim();
  const course = $("#resource-course").value.trim();
  const resourceType = $("#resource-type").value;
  const description = $("#resource-description").value.trim();

  const safeFilename = file.name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const filePath = `${currentUser.id}/${Date.now()}-${safeFilename}`;

  submitButton.disabled = true;
  submitButton.textContent = "Mengunggah...";
  setStatus("#upload-status", "Mengunggah file ke penyimpanan...");

  let uploadedFilePath = null;

  try {
    const { error: uploadError } = await db.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) throw uploadError;

    uploadedFilePath = filePath;

    setStatus("#upload-status", "Menyimpan informasi dokumen...");

    const { error: insertError } = await db
      .from("resources")
      .insert({
        title,
        course,
        resource_type: resourceType,
        description: description || null,
        file_path: filePath,
        original_filename: file.name
      });

    if (insertError) throw insertError;

    form.reset();
    setStatus("#upload-status", "Dokumen berhasil diunggah!");
    showToast("Dokumen berhasil ditambahkan.");

    await loadResources();
  } catch (error) {
    console.error("Upload gagal:", error);

    // Jika metadata gagal disimpan, coba hapus file yang sudah diunggah.
    if (uploadedFilePath) {
      const { error: cleanupError } = await db.storage
        .from(BUCKET_NAME)
        .remove([uploadedFilePath]);

      if (cleanupError) {
        console.error("Gagal membersihkan file:", cleanupError);
      }
    }

    setStatus(
      "#upload-status",
      error.message || "Upload gagal. Periksa konfigurasi Supabase.",
      true
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "↑ Unggah Dokumen";
  }
}

async function handleDelete(event) {
  const button = event.target.closest("[data-delete-id]");

  if (!button || !isAdmin()) return;

  const resourceId = Number(button.dataset.deleteId);
  const resource = resources.find((item) => Number(item.id) === resourceId);

  if (!resource) {
    showToast("Dokumen tidak ditemukan.", true);
    return;
  }

  const confirmed = window.confirm(
    `Hapus "${resource.title}"?\n\nFile dan informasi dokumen akan dihapus.`
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Menghapus...";

  try {
    // Hapus metadata lebih dahulu agar file tetap ada jika query gagal.
    const { error: deleteRowError } = await db
      .from("resources")
      .delete()
      .eq("id", resourceId);

    if (deleteRowError) throw deleteRowError;

    const { error: deleteFileError } = await db.storage
      .from(BUCKET_NAME)
      .remove([resource.file_path]);

    if (deleteFileError) {
      console.error("File storage belum terhapus:", deleteFileError);
      showToast(
        "Data dokumen dihapus, tetapi file penyimpanan gagal dihapus. Periksa Storage.",
        true
      );
    } else {
      showToast("Dokumen berhasil dihapus.");
    }

    await loadResources();
  } catch (error) {
    console.error("Penghapusan gagal:", error);
    showToast(error.message || "Gagal menghapus dokumen.", true);
    await loadResources();
  }
}

function connectInterface() {
  $("#current-year").textContent = new Date().getFullYear();

  $("#search-input").addEventListener("input", renderResources);
  $("#type-filter").addEventListener("change", renderResources);
  $("#course-filter").addEventListener("change", renderResources);

  $("#open-admin").addEventListener("click", () => {
    if (isAdmin()) {
      $("#admin-section").scrollIntoView({ behavior: "smooth" });
    } else {
      $("#login-dialog").showModal();
    }
  });

  $("#close-login").addEventListener("click", () => {
    $("#login-dialog").close();
  });

  $("#login-dialog").addEventListener("click", (event) => {
    if (event.target === $("#login-dialog")) {
      $("#login-dialog").close();
    }
  });

  $("#login-form").addEventListener("submit", handleLogin);
  $("#logout-button").addEventListener("click", handleLogout);
  $("#upload-form").addEventListener("submit", handleUpload);
  $("#admin-resource-list").addEventListener("click", handleDelete);
}

async function initialize() {
  connectInterface();

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error("Gagal memeriksa sesi:", error);
  }

  currentUser = data?.session?.user || null;

  if (currentUser && !isAdmin()) {
    await db.auth.signOut();
    currentUser = null;
  }

  updateAdminInterface();
  await loadResources();

  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    if (currentUser && currentUser.id !== ADMIN_UID) {
      db.auth.signOut();
      currentUser = null;
    }

    updateAdminInterface();
  });
}

initialize();
