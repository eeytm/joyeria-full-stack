// public/js/admin.js

/* ====== Guardas de sesión ====== */
const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');
const email = localStorage.getItem('userEmail');

if (!token || role !== 'admin') {
  const next = encodeURIComponent('admin.html');
  window.location.href = `login.html?next=${next}`;
}

document.getElementById('adminEmail').textContent = email || '';

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('userEmail');
  window.location.href = 'index.html';
});

/* ====== UI refs ====== */
const $tbody = document.querySelector('#tblProductos tbody');
const $modal = $('#modalProducto');
const $frm   = document.getElementById('frmProducto');
const money  = new Intl.NumberFormat('es-GT', { style:'currency', currency:'GTQ' });

/* Dropzone refs */
const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const imgPreview = document.getElementById('imgPreview');

/* ====== Tabla ====== */
function rowHTML(p) {
  return `
    <tr data-id="${p.Id}">
      <td>${p.Id}</td>
      <td>${p.Codigo ?? ''}</td>
      <td>${p.Nombre}</td>
      <td>${money.format(p.Precio)}</td>
      <td>${p.Stock}</td>
      <td>${Number(p.Activo) ? 'Sí' : 'No'}</td>
      <td class="text-right">
        <button class="btn btn-sm btn-outline-secondary btn-edit">Editar</button>
        <button class="btn btn-sm btn-outline-danger btn-del">Borrar</button>
      </td>
    </tr>
  `;
}

async function loadProductos() {
  const res = await fetch('/api/products');
  const list = await res.json();
  $tbody.innerHTML = list.map(rowHTML).join('');
}
loadProductos();

/* ====== Crear ====== */
document.querySelector('[data-target="#modalProducto"]').addEventListener('click', () => {
  document.getElementById('modalTitle').textContent = 'Nuevo producto';
  $frm.reset();
  document.getElementById('p_id').value = '';
  imgPreview.classList.add('d-none');
  imgPreview.src = '';
});

/* ====== Guardar (crear/editar) ====== */
$frm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('p_id').value.trim();

  const payload = {
    Codigo:   document.getElementById('p_codigo').value.trim(),
    Nombre:   document.getElementById('p_nombre').value.trim(),
    Precio:   Number(document.getElementById('p_precio').value || 0),
    Stock:    Number(document.getElementById('p_stock').value || 0),
    Activo:   Number(document.getElementById('p_activo').value || 1),
    Categoria:document.getElementById('p_categoria').value.trim(),
    Material: document.getElementById('p_material').value.trim(),
    ImagenUrl:document.getElementById('p_imagen').value.trim()
  };

  const opts = {
    method: id ? 'PUT' : 'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  };

  const url = id ? `/api/products/${id}` : '/api/products';
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Error');

  // Si era nuevo, podríamos invitar a subir imagen luego…
  if (!id) {
    alert('Producto creado. Ahora puedes editarlo para subir una imagen.');
  }

  $modal.modal('hide');
  await loadProductos();
});

/* ====== Editar / Borrar ====== */
$tbody.addEventListener('click', async (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const id = tr.getAttribute('data-id');

  if (e.target.classList.contains('btn-edit')) {
    document.getElementById('modalTitle').textContent = 'Editar producto';
    const r = await fetch(`/api/products/${id}`);
    const p = await r.json();

    document.getElementById('p_id').value = p.Id;
    document.getElementById('p_codigo').value = p.Codigo || '';
    document.getElementById('p_nombre').value = p.Nombre || '';
    document.getElementById('p_precio').value = p.Precio || 0;
    document.getElementById('p_stock').value  = p.Stock || 0;
    document.getElementById('p_activo').value = Number(p.Activo ? 1 : 0);
    document.getElementById('p_categoria').value = p.Categoria || '';
    document.getElementById('p_material').value  = p.Material || '';
    document.getElementById('p_imagen').value    = p.ImagenUrl || '';

    if (p.ImagenUrl) {
      imgPreview.src = p.ImagenUrl;
      imgPreview.classList.remove('d-none');
    } else {
      imgPreview.classList.add('d-none');
      imgPreview.src = '';
    }

    $modal.modal('show');
  }

  if (e.target.classList.contains('btn-del')) {
    if (!confirm('¿Borrar este producto?')) return;
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Error');
    await loadProductos();
  }
});

/* ====== Drag & Drop / Subida de imagen ====== */

function openFilePicker() {
  fileInput.click();
}

// cuando haces click en el dropzone
dropZone.addEventListener('click', openFilePicker);

// resaltar cuando arrastras
['dragenter', 'dragover'].forEach(ev =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach(ev =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('dragover');
  })
);

// soltar archivo
dropZone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files && files[0]) handleFile(files[0]);
});

// file input manual
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  const productId = document.getElementById('p_id').value.trim();
  if (!productId) {
    alert('Primero guarda el producto (para obtener su ID), luego vuelve a editar y sube la imagen.');
    return;
  }

  // preview inmediata
  const reader = new FileReader();
  reader.onload = () => {
    imgPreview.src = reader.result;
    imgPreview.classList.remove('d-none');
  };
  reader.readAsDataURL(file);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/products/${productId}/image`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Error subiendo imagen');

    // Actualiza el input de URL con la ruta subida
    document.getElementById('p_imagen').value = data.url || '';
  } catch (err) {
    console.error(err);
    alert('Error al subir imagen');
  }
}
