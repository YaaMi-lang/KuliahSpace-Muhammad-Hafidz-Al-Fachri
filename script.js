
"use strict";

// Konfigurasi project Supabase KuliahSpace.
const SUPABASE_URL = "https://yzpuwhrxatteahtkjruk.supabase.co";
const SUPABASE_KEY = "sb_publishable_TbCxko3x695wX1Lz0YTC1Q_dFBzKe5K";
const ADMIN_UID = "c39ae790-cc7b-4884-89a2-65879e5201e8";
const BUCKET = "kuliahspace-files";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let resourcesCache = [];
let authCheckPromise = null;

const $ = (selector) => document.querySelector(selector);

function setStatus(selector, message, type = "") {
  const element = $(selector);
  if (!element) return;

  element.textContent = message;
  element.classList.remove("error", "success");

  if (type) element.classList.add(type);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "Tanggal tidak tersedia";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tanggal tidak tersedia";

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getPublicFileUrl(path) {
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function getCurrentPage() {
  const file = location.pathname.split("/").pop().toLowerCase();

  if (file === "materi.html") return "Materi";
  if (file === "tugas.html") return "Tugas";
  if (file === "admin.html") return "Admin";
  return "Beranda";
}

function renderResourceCard(resource, adminMode = false) {
  const title = escapeHTML(resource.title);
  const course = escapeHTML(resource.course);
  const description = escapeHTML(resource.description || "Tidak ada deskripsi.");
  const type = escapeHTML(resource.resource_type);
  const filename = escapeHTML(resource.original_filename);
  const url = getPublicFileUrl(resource.file_path);

  return `
    <article class="resource-card">
      <span class="resource-type">${type}</span>
      <h3>${title}</h3>
      <p class="resource-meta">Mata kuliah: ${course}</p>
      <p>${description}</p>
      <p class="resource-meta">
        File: ${filename}<br>
        Diunggah: ${formatDate(resource.uploaded_at)}
      </p>
      <a class="button primary"
         href="${escapeHTML(url)}"
         target="_blank"
         rel="noopener noreferrer">
        Unduh / Buka File
      </a>
      ${
  adminMode
    ? `<div class="admin-resource-actions">
         <button class="button primary edit-resource"
           type="button" data-id="${Number(resource.id)}">
           Edit Dokumen
         </button>

         <button class="button secondary delete-resource"
           type="button" data-id="${Number(resource.id)}">
           Hapus Dokumen
         </button>
       </div>`
    : ""
}
    </article>
  `;
}

async function loadResources() {
  const page = getCurrentPage();

  const { data, error } = await db
    .from("resources")
    .select("*")
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("Gagal memuat resources:", error);

    setStatus("#resource-status",
      "Materi atau tugas belum dapat dimuat. Silakan coba lagi.", "error");
    setStatus("#admin-resource-status",
      "Daftar dokumen gagal dimuat. Periksa koneksi dan izin database.", "error");
    setStatus("#home-status",
      "Ringkasan belum dapat dimuat dari database.", "error");

    return;
  }

  resourcesCache = data || [];

  // Ringkasan di Beranda.
  const materialCount = $("#home-material-count");
  const taskCount = $("#home-task-count");

  if (materialCount) {
    materialCount.textContent = resourcesCache.filter(
      item => item.resource_type === "Materi"
    ).length;
  }

  if (taskCount) {
    taskCount.textContent = resourcesCache.filter(
      item => item.resource_type === "Tugas"
    ).length;
  }

  if ($("#home-status")) {
    setStatus("#home-status", "Data berhasil diperbarui.", "success");
  }

  // Halaman Materi dan Tugas.
  if (page === "Materi" || page === "Tugas") {
    renderPublicResources();
  }

  // Halaman Admin.
  if (page === "Admin" && currentUser?.id === ADMIN_UID) {
    renderAdminResources();
  }
}

function renderPublicResources() {
  const list = $("#resource-list");
  if (!list) return;

  const page = getCurrentPage();
  const search = ($("#resource-search")?.value || "").trim().toLowerCase();

  const filtered = resourcesCache.filter((item) => {
    const correctType = item.resource_type === page;
    const searchable = [
      item.title,
      item.course,
      item.description,
      item.original_filename
    ].join(" ").toLowerCase();

    return correctType && searchable.includes(search);
  });

  const count = $("#resource-count");
  if (count) count.textContent = `${filtered.length} dokumen ditemukan`;

  if (filtered.length === 0) {
    list.innerHTML = "";
    setStatus(
      "#resource-status",
      search
        ? "Tidak ada dokumen yang cocok dengan pencarian."
        : `Belum ada ${page.toLowerCase()} yang tersedia.`,
      ""
    );
    return;
  }

  setStatus("#resource-status", "");
  list.innerHTML = filtered.map(item => renderResourceCard(item)).join("");
}


function renderAdminResources() {
  const list = $("#admin-resource-list");
  if (!list) return;

  if (!resourcesCache.length) {
    list.innerHTML = "";
    setStatus("#admin-resource-status", "Belum ada dokumen yang diunggah.");
    return;
  }

  setStatus("#admin-resource-status", "");

  list.innerHTML = resourcesCache
    .map(item => renderResourceCard(item, true))
    .join("");

  list.querySelectorAll(".edit-resource").forEach(button => {
    button.addEventListener("click", () => {
      openEditDialog(Number(button.dataset.id));
    });
  });

  list.querySelectorAll(".delete-resource").forEach(button => {
    button.addEventListener("click", () => {
      deleteResource(Number(button.dataset.id));
    });
  });
}


async function handleLogin(event) {
  event.preventDefault();

  const email = $("#admin-email")?.value.trim();
  const password = $("#admin-password")?.value;

  if (!email || !password) {
    setStatus("#login-status", "Email dan password wajib diisi.", "error");
    return;
  }

  const submitButton = $("#login-form button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  setStatus("#login-status", "Sedang memeriksa akun...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (data.user?.id !== ADMIN_UID) {
      await db.auth.signOut();
      currentUser = null;
      throw new Error("Akun ini tidak memiliki akses admin.");
    }

    currentUser = data.user;
    await updateAdminInterface();
  } catch (error) {
    console.error("Login gagal:", error);
    setStatus("#login-status", error.message || "Login gagal.", "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function updateAdminInterface() {
  const loginPanel = $("#login-panel");
  const adminSection = $("#admin-section");

  if (!loginPanel || !adminSection) return;

  if (currentUser?.id === ADMIN_UID) {
    loginPanel.classList.add("hidden");
    adminSection.classList.remove("hidden");

    const userLabel = $("#admin-user-label");
    if (userLabel) userLabel.textContent = `Login sebagai ${currentUser.email || "Admin"}`;

    setStatus("#login-status", "");
    await loadResources();
  } else {
    adminSection.classList.add("hidden");
    loginPanel.classList.remove("hidden");
  }
}

function safeFilename(filename) {
  // Hindari path folder yang tidak diinginkan dalam nama file.
  const cleaned = filename
    .normalize("NFKC")
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\- ()]/g, "_")
    .trim()
    .slice(0, 150);

  return cleaned || "dokumen";
}

async function handleUpload(event) {
  event.preventDefault();

  if (currentUser?.id !== ADMIN_UID) {
    setStatus("#upload-status", "Kamu tidak memiliki akses admin.", "error");
    return;
  }

  const title = $("#resource-title").value.trim();
  const course = $("#resource-course").value.trim();
  const resourceType = $("#resource-type").value;
  const description = $("#resource-description").value.trim();
  const file = $("#resource-file").files[0];

  if (!title || !course || !file) {
    setStatus("#upload-status", "Lengkapi judul, mata kuliah, dan file.", "error");
    return;
  }

  if (!["Materi", "Tugas"].includes(resourceType)) {
    setStatus("#upload-status", "Jenis dokumen tidak valid.", "error");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setStatus("#upload-status", "Ukuran file maksimal 25 MB.", "error");
    return;
  }

  if (file.size === 0) {
    setStatus("#upload-status", "File kosong tidak dapat diunggah.", "error");
    return;
  }

  const submitButton = $("#upload-form button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  const path = `${currentUser.id}/${Date.now()}-${safeFilename(file.name)}`;

  setStatus("#upload-status", "Mengunggah file...");

  let uploaded = false;

  try {
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) throw uploadError;
    uploaded = true;

    const { error: insertError } = await db.from("resources").insert({
      title,
      course,
      resource_type: resourceType,
      description: description || null,
      file_path: path,
      original_filename: file.name
    });

    if (insertError) {
      // Bersihkan objek jika metadata gagal disimpan.
      const { error: cleanupError } = await db.storage.from(BUCKET).remove([path]);
      if (cleanupError) {
        console.error("File yatim perlu dibersihkan:", cleanupError);
      }
      uploaded = false;
      throw insertError;
    }

    $("#upload-form").reset();
    setStatus("#upload-status", "Dokumen berhasil diunggah!", "success");
    await loadResources();
  } catch (error) {
    console.error("Upload gagal:", error);
    setStatus("#upload-status",
      error.message || "Upload gagal. Periksa koneksi atau izin Supabase.", "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function openEditDialog(id) {
  if (currentUser?.id !== ADMIN_UID) {
    setStatus("#admin-resource-status", "Akses admin diperlukan.", "error");
    return;
  }

  const resource = resourcesCache.find(
    item => Number(item.id) === Number(id)
  );

  if (!resource) return;

  // Buat dialog jika belum tersedia.
  let dialog = document.querySelector("#edit-resource-dialog");

  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "edit-resource-dialog";

    dialog.style.width = "min(560px, calc(100% - 32px))";
    dialog.style.maxHeight = "85vh";
    dialog.style.overflowY = "auto";
    dialog.style.border = "1px solid #ddd";
    dialog.style.borderRadius = "14px";
    dialog.style.padding = "24px";

    document.body.appendChild(dialog);
  }

  dialog.innerHTML = `
    <h2>Edit Dokumen</h2>

    <form id="edit-resource-form" class="form-stack">
      <label for="edit-title">Judul dokumen</label>
      <input id="edit-title" type="text"
        maxlength="200" required>

      <label for="edit-course">Mata kuliah</label>
      <input id="edit-course" type="text"
        maxlength="200" required>

      <label for="edit-type">Jenis dokumen</label>
      <select id="edit-type" required>
        <option value="Materi">Materi</option>
        <option value="Tugas">Tugas</option>
      </select>

      <label for="edit-description">Deskripsi</label>
      <textarea id="edit-description" rows="4"
        maxlength="5000"></textarea>

      <label for="edit-file">Ganti file (opsional)</label>
      <input id="edit-file" type="file">
      <small>
        Kosongkan jika file lama tidak ingin diganti.
        Maksimal 25 MB.
      </small>

      <p id="edit-status" role="status"></p>

      <div class="admin-resource-actions">
        <button class="button primary" type="submit">
          Simpan Perubahan
        </button>

        <button class="button secondary"
          id="cancel-edit" type="button">
          Batal
        </button>
      </div>
    </form>
  `;

  $("#edit-title").value = resource.title || "";
  $("#edit-course").value = resource.course || "";
  $("#edit-type").value = resource.resource_type;
  $("#edit-description").value = resource.description || "";

  $("#cancel-edit").addEventListener("click", () => {
    dialog.close();
  });

  $("#edit-resource-form").addEventListener("submit", async event => {
    event.preventDefault();

    if (currentUser?.id !== ADMIN_UID) {
      setStatus("#edit-status", "Akses admin diperlukan.", "error");
      return;
    }

    const title = $("#edit-title").value.trim();
    const course = $("#edit-course").value.trim();
    const resourceType = $("#edit-type").value;
    const description = $("#edit-description").value.trim();
    const newFile = $("#edit-file").files[0];

    if (!title || !course) {
      setStatus("#edit-status",
        "Judul dan mata kuliah wajib diisi.", "error");
      return;
    }

    if (!["Materi", "Tugas"].includes(resourceType)) {
      setStatus("#edit-status",
        "Jenis dokumen tidak valid.", "error");
      return;
    }

    if (newFile && newFile.size > MAX_FILE_SIZE) {
      setStatus("#edit-status",
        "Ukuran file maksimal 25 MB.", "error");
      return;
    }

    if (newFile && newFile.size === 0) {
      setStatus("#edit-status",
        "File kosong tidak dapat diunggah.", "error");
      return;
    }

    const submitButton = $("#edit-resource-form button[type='submit']");
    submitButton.disabled = true;
    setStatus("#edit-status", "Menyimpan perubahan...");

    let newPath = null;

    try {
      let filePath = resource.file_path;
      let originalFilename = resource.original_filename;

      // Jika pengguna memilih file baru, unggah ke path baru.
      if (newFile) {
        newPath =
          `${currentUser.id}/${Date.now()}-${safeFilename(newFile.name)}`;

        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(newPath, newFile, {
            upsert: false,
            contentType: newFile.type || "application/octet-stream"
          });

        if (uploadError) throw uploadError;

        filePath = newPath;
        originalFilename = newFile.name;
      }

      const { error: updateError } = await db
        .from("resources")
        .update({
          title,
          course,
          resource_type: resourceType,
          description: description || null,
          file_path: filePath,
          original_filename: originalFilename
        })
        .eq("id", id);

      if (updateError) {
        // Jika metadata gagal diperbarui, bersihkan file baru.
        if (newPath) {
          const { error: cleanupError } = await db.storage
            .from(BUCKET)
            .remove([newPath]);

          if (cleanupError) {
            console.error(
              "File baru perlu dibersihkan:",
              cleanupError
            );
          }
        }

        newPath = null;
        throw updateError;
      }

      // Database sudah berhasil diperbarui.
      // Sekarang file lama boleh dihapus.
      let cleanupWarning = "";

      if (newPath && resource.file_path) {
        const { error: removeError } = await db.storage
          .from(BUCKET)
          .remove([resource.file_path]);

        if (removeError) {
          console.error("File lama belum terhapus:", removeError);
          cleanupWarning =
            " Metadata berhasil diperbarui, tetapi file lama gagal dihapus. Periksa Storage.";
        }
      }

      dialog.close();

      await loadResources();

      setStatus(
        "#admin-resource-status",
        "Perubahan dokumen berhasil disimpan." + cleanupWarning,
        cleanupWarning ? "error" : "success"
      );
    } catch (error) {
      console.error("Edit dokumen gagal:", error);

      setStatus(
        "#edit-status",
        error.message || "Gagal menyimpan perubahan.",
        "error"
      );
    } finally {
      if (submitButton.isConnected) {
        submitButton.disabled = false;
      }
    }
  });

  if (!dialog.open) dialog.showModal();
}


async function deleteResource(id) {
  if (currentUser?.id !== ADMIN_UID) {
    setStatus("#admin-resource-status",
      "Akses admin diperlukan.", "error");
    return;
  }

  const resource = resourcesCache.find(
    item => Number(item.id) === Number(id)
  );

  if (!resource) return;

  const confirmed = window.confirm(
    `Hapus dokumen "${resource.title}"? Tindakan ini tidak dapat dibatalkan.`
  );

  if (!confirmed) return;

  setStatus("#admin-resource-status", "Menghapus dokumen...");

  try {
    // Hapus metadata dahulu.
    const { error: databaseError } = await db
      .from("resources")
      .delete()
      .eq("id", id);

    if (databaseError) throw databaseError;

    // Setelah metadata terhapus, bersihkan file Storage.
    const { error: storageError } = await db.storage
      .from(BUCKET)
      .remove([resource.file_path]);

    await loadResources();

    if (storageError) {
      console.error("File Storage belum terhapus:", storageError);

      setStatus(
        "#admin-resource-status",
        "Dokumen sudah dihapus dari daftar, tetapi file Storage belum berhasil dihapus. Periksa Storage secara manual.",
        "error"
      );
      return;
    }

    setStatus(
      "#admin-resource-status",
      "Dokumen berhasil dihapus.",
      "success"
    );
  } catch (error) {
    console.error("Penghapusan gagal:", error);

    setStatus(
      "#admin-resource-status",
      error.message || "Dokumen gagal dihapus.",
      "error"
    );
  }
}

async function handleLogout() {
  const { error } = await db.auth.signOut();

  if (error) {
    setStatus("#login-status", "Gagal keluar: " + error.message, "error");
    return;
  }

  currentUser = null;
  resourcesCache = [];
  await updateAdminInterface();
  setStatus("#login-status", "Kamu sudah keluar dari akun admin.", "success");
}

async function initialize() {
  document.querySelectorAll(".current-year").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });

  // Halaman publik bisa membaca resources tanpa login.
  await loadResources();

  // Cari sesi login yang masih aktif.
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error("Gagal membaca sesi:", error);
  }

  currentUser = data?.session?.user || null;

  if (getCurrentPage() === "Admin") {
    if (currentUser && currentUser.id !== ADMIN_UID) {
      await db.auth.signOut();
      currentUser = null;
    }
    await updateAdminInterface();
  }

  // Sinkronkan UI saat sesi berubah.
  db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;

    if (getCurrentPage() === "Admin") {
      if (currentUser && currentUser.id !== ADMIN_UID) {
        currentUser = null;
        db.auth.signOut().catch(console.error);
      }

      // Jadwalkan pekerjaan async setelah callback auth selesai.
      Promise.resolve().then(() => updateAdminInterface());
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("#resource-search")?.addEventListener("input", renderPublicResources);
  $("#login-form")?.addEventListener("submit", handleLogin);
  $("#upload-form")?.addEventListener("submit", handleUpload);
  $("#logout-button")?.addEventListener("click", handleLogout);
  $("#refresh-admin")?.addEventListener("click", loadResources);

  initialize().catch((error) => {
    console.error("Inisialisasi KuliahSpace gagal:", error);
    setStatus("#resource-status", "Website gagal memuat data.", "error");
    setStatus("#login-status", "Gagal menginisialisasi halaman.", "error");
  });
});
