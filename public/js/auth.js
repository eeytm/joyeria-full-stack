// public/js/auth.js
const API_BASE = ''; // mismo host

const $ = (sel, ctx = document) => ctx.querySelector(sel);

// ---------- toggle login/registro ----------
const loginForm = $('#loginForm');
const registerCard = $('#registerCard');
const registerForm = $('#registerForm');
const goRegister = $('#goRegister');

goRegister?.addEventListener('click', (e) => {
  e.preventDefault();
  registerCard.classList.toggle('d-none');
  // desplázate por UX
  registerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ---------- helpers ----------
function saveSession({ token, user }) {
  localStorage.setItem('token', token);
  localStorage.setItem('role', user.role);
  localStorage.setItem('name', user.nombre || user.name || '');
  localStorage.setItem('email', user.email || '');
}

function handleRedirectByRole(role) {
  if (role === 'admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'index.html';
  }
}

function showError(msg) {
  alert(msg || 'Error inesperado');
}

// ---------- LOGIN ----------
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const password = $('#password').value;

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Email: email, Password: password }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return showError(data.error || (data.errors && data.errors[0]?.msg) || 'Credenciales inválidas');
    }

    saveSession({ token: data.token, user: data.user });
    handleRedirectByRole(data.user.role);
  } catch (err) {
    showError(err.message);
  }
});

// ---------- REGISTRO ----------
registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const Nombre = $('#r_name').value.trim();
  const Email = $('#r_email').value.trim();
  const Password = $('#r_pass').value;

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Nombre, Email, Password }), // Rol por defecto: 'cliente'
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return showError(data.error || (data.errors && data.errors[0]?.msg) || 'No se pudo registrar');
    }

    // si /register devuelve token + user (como en tu backend), guarda y redirige;
    if (data.token && data.user) {
      saveSession({ token: data.token, user: data.user });
      handleRedirectByRole(data.user.role);
    } else {
      // si no devuelve token, pide iniciar sesión
      alert('Registro exitoso. Ahora inicia sesión.');
      registerCard.classList.add('d-none');
    }
  } catch (err) {
    showError(err.message);
  }
});
