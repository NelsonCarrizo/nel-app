const firebaseConfig = {
  apiKey: "AIzaSyBOGjCbKMiu0Sy5kTNgm0O1xR9sySML2bU",
  authDomain: "sin-analytics-84167.firebaseapp.com",
  projectId: "sin-analytics-84167",
  storageBucket: "sin-analytics-84167.firebasestorage.app",
  messagingSenderId: "381236355122",
  appId: "1:381236355122:web:7de8e188e40f2e46f65c2b",
  measurementId: "G-C1R90L4178"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Service Worker PWA v1.0.1
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.log('SW error:', e));
}

// Globales de sesión
let usuarioActual = null;
let modoOculto = false;
let listaServiciosCache = [];
let contadorFrecuenciaServicios = {};
let categoriaActiva = 'TODOS';

// Reloj en Tiempo Real
function iniciarReloj() {
  setInterval(() => {
    const ahora = new Date();
    document.getElementById('clock-date').innerText = ahora.toLocaleDateString('es-AR');
    document.getElementById('clock-time').innerText = ahora.toLocaleTimeString('es-AR');
  }, 1000);
}
iniciarReloj();

// ==========================================
// AUTENTICACIÓN Y LOGIN DE CREDENCIALES
// ==========================================
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userInput = document.getElementById('login-user').value.trim().toLowerCase();
  const passInput = document.getElementById('login-pass').value.trim();

  // Acceso directo Admin (Nelson)
  if (userInput === 'admin' && passInput === 'admin123') {
    usuarioActual = { 
      id: 'admin', 
      nombre: 'Nelson (Admin)', 
      login: 'admin', 
      rol: 'admin', 
      especialidades: ['Manicura','Pedicuria','Depilacion','Otros'] 
    };
    iniciarSesionUI();
    return;
  }

  // Consulta en Firestore para usuarias
  try {
    const q = await db.collection('usuarios').where('login', '==', userInput).where('pass', '==', passInput).get();
    if (!q.empty) {
      const doc = q.docs[0];
      const data = doc.data();
      usuarioActual = { id: doc.id, ...data, rol: 'usuaria' };
      iniciarSesionUI();
    } else {
      alert('Usuario o contraseña incorrectos.');
    }
  } catch (err) {
    alert('Error al autenticar: ' + err.message);
  }
});

function iniciarSesionUI() {
  document.getElementById('sec-login').style.display = 'none';
  document.getElementById('main-nav').style.display = 'flex';
  document.getElementById('user-role-label').innerText = `${usuarioActual.nombre} (${usuarioActual.rol.toUpperCase()})`;

  if (usuarioActual.rol === 'admin') {
    document.getElementById('nav-admin').style.display = 'block';
    verSeccion('admin');
    cargarDatosAdmin();
  } else {
    document.getElementById('nav-admin').style.display = 'none';
    verSeccion('usuaria');
    escucharServiciosYFrecuencia();
    escucharRegistrosUsuaria();
    escucharAvisosAdmin();
  }
}

function cerrarSesion() {
  usuarioActual = null;
  document.getElementById('sec-login').style.display = 'block';
  document.getElementById('sec-usuaria').style.display = 'none';
  document.getElementById('sec-historial').style.display = 'none';
  document.getElementById('sec-admin').style.display = 'none';
  document.getElementById('main-nav').style.display = 'none';
  document.getElementById('form-login').reset();
}

function verSeccion(sec) {
  document.getElementById('sec-usuaria').style.display = sec === 'usuaria' ? 'block' : 'none';
  document.getElementById('sec-historial').style.display = sec === 'historial' ? 'block' : 'none';
  document.getElementById('sec-admin').style.display = sec === 'admin' ? 'block' : 'none';

  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  if (document.getElementById(`nav-${sec}`)) {
    document.getElementById(`nav-${sec}`).classList.add('active');
  }

  if (sec === 'historial') cargarHistorialPorFecha();
}

// Modo Incógnito / Ojo 👁️
function togglePrivacidad() {
  modoOculto = !modoOculto;
  actualizarUIComisiones();
}

// ==========================================
// CARGA Y REGISTRO DE SERVICIOS (USUARIAS)
// ==========================================
function escucharServiciosYFrecuencia() {
  db.collection('servicios').onSnapshot(snapshot => {
    listaServiciosCache = [];
    snapshot.forEach(doc => {
      listaServiciosCache.push({ id: doc.id, ...doc.data() });
    });
    renderizarTarjetasServicios();
  });
}

function filtrarCategoria(cat, ev) {
  categoriaActiva = cat;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  if (ev) ev.target.classList.add('active');
  renderizarTarjetasServicios();
}

function filtrarServiciosExpress() {
  renderizarTarjetasServicios();
}

function renderizarTarjetasServicios() {
  const container = document.getElementById('grid-servicios');
  if (!container) return;
  
  const busqueda = (document.getElementById('search-servicio')?.value || '').toLowerCase();
  container.innerHTML = '';

  let filtrados = listaServiciosCache.filter(s => {
    const habilitado = usuarioActual && usuarioActual.especialidades ? usuarioActual.especialidades.includes(s.categoria) : true;
    const coincideCat = categoriaActiva === 'TODOS' || s.categoria === categoriaActiva;
    const coincideNombre = s.nombre.toLowerCase().includes(busqueda);
    return habilitado && coincideCat && coincideNombre;
  });

  if (categoriaActiva === 'TODOS') {
    filtrados.sort((a,b) => (contadorFrecuenciaServicios[b.id] || 0) - (contadorFrecuenciaServicios[a.id] || 0));
  }

  filtrados.forEach((s, index) => {
    const ganancia = (s.precio * (s.comision / 100)).toFixed(2);
    const esTop3 = (categoriaActiva === 'TODOS' && index < 3 && (contadorFrecuenciaServicios[s.id] || 0) > 0);

    container.innerHTML += `
      <div class="service-card" onclick="registrarServicioRapido('${s.id}', '${s.nombre}', ${s.precio}, ${ganancia}, '${s.categoria}')">
        ${esTop3 ? '<span class="top3-badge">⭐ TOP MÁS USADO</span>' : ''}
        <h4>${s.nombre}</h4>
        <span class="badge-price">${modoOculto ? '$ ****' : '$' + ganancia}</span>
      </div>
    `;
  });
}

async function registrarServicioRapido(id, nombre, precio, comisionMonto, categoria) {
  if (usuarioActual.jornadaCerrada) {
    alert('Tu jornada laboral ya fue marcada como "Fin del Servicio". No podés registrar más trabajos hoy.');
    return;
  }

  try {
    await db.collection('registros').add({
      usuariaId: usuarioActual.id,
      usuariaNombre: usuarioActual.nombre,
      servicioId: id,
      servicioNombre: nombre,
      categoria: categoria,
      precioTotal: precio,
      comisionMonto: parseFloat(comisionMonto),
      fecha: new Date()
    });

    contadorFrecuenciaServicios[id] = (contadorFrecuenciaServicios[id] || 0) + 1;
    renderizarTarjetasServicios();
  } catch (err) {
    alert('Error al registrar servicio: ' + err.message);
  }
}

// ==========================================
// REGISTROS, FIN DE JORNADA Y ADELANTOS
// ==========================================
function escucharRegistrosUsuaria() {
  const hoyInicio = new Date();
  hoyInicio.setHours(0,0,0,0);

  db.collection('registros')
    .where('usuariaId', '==', usuarioActual.id)
    .orderBy('fecha', 'desc')
    .onSnapshot(snapshot => {
      let totalHoy = 0;
      let totalSemana = 0;
      const tablaHoy = document.getElementById('tabla-hoy-usuaria');
      if (tablaHoy) tablaHoy.innerHTML = '';

      snapshot.forEach(doc => {
        const r = doc.data();
        const f = r.fecha ? r.fecha.toDate() : new Date();

        totalSemana += r.comisionMonto || 0;

        if (f >= hoyInicio) {
          totalHoy += r.comisionMonto || 0;
          if (tablaHoy) {
            tablaHoy.innerHTML += `
              <tr>
                <td>${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</td>
                <td><strong>${r.servicioNombre}</strong></td>
                <td><span class="badge">${modoOculto ? '$ ****' : '$' + r.comisionMonto.toFixed(2)}</span></td>
              </tr>
            `;
          }
        }
      });

      usuarioActual.totalHoy = totalHoy;
      usuarioActual.totalSemana = totalSemana;
      actualizarUIComisiones();
    });

  db.collection('adelantos')
    .where('usuariaId', '==', usuarioActual.id)
    .onSnapshot(snapshot => {
      let totalAdelantos = 0;
      snapshot.forEach(doc => totalAdelantos += doc.data().monto || 0);
      usuarioActual.totalAdelantos = totalAdelantos;
      actualizarUIComisiones();
    });
}

function actualizarUIComisiones() {
  if (!usuarioActual) return;
  const hoy = usuarioActual.totalHoy || 0;
  const sem = usuarioActual.totalSemana || 0;
  const ade = usuarioActual.totalAdelantos || 0;
  const neto = sem - ade;

  const elemHoy = document.getElementById('kpi-hoy');
  const elemSem = document.getElementById('kpi-semana');
  const elemAde = document.getElementById('kpi-adelantos');
  const elemNeto = document.getElementById('kpi-total-cobrar');

  if (elemHoy) elemHoy.innerText = modoOculto ? '$ ****' : `$${hoy.toFixed(2)}`;
  if (elemSem) elemSem.innerText = modoOculto ? '$ ****' : `$${sem.toFixed(2)}`;
  if (elemAde) elemAde.innerText = modoOculto ? '$ ****' : `$${ade.toFixed(2)}`;
  if (elemNeto) elemNeto.innerText = modoOculto ? '$ ****' : `$${neto.toFixed(2)}`;

  renderizarTarjetasServicios();
}

async function solicitarAdelanto() {
  const input = document.getElementById('monto-adelanto');
  const monto = parseFloat(input.value);
  if (!monto || monto <= 0) return alert('Ingresá un monto válido.');

  try {
    await db.collection('adelantos').add({
      usuariaId: usuarioActual.id,
      usuariaNombre: usuarioActual.nombre,
      monto: monto,
      fecha: new Date()
    });
    input.value = '';
    alert('Adelanto registrado correctamente.');
  } catch (err) {
    alert('Error al pedir adelanto: ' + err.message);
  }
}

function cerrarJornadaDiaria() {
  if (confirm('¿Deseás marcar el FIN DEL SERVICIO de hoy? Las cargas de servicios quedarán congeladas hasta mañana.')) {
    usuarioActual.jornadaCerrada = true;
    document.getElementById('label-estado-dia').innerText = 'Jornada Cerrada 🔒';
    document.getElementById('label-estado-dia').style.background = 'var(--danger-color)';
    alert('Jornada finalizada correctamente.');
  }
}

// Histórico / Calendario
async function cargarHistorialPorFecha() {
  const inputFecha = document.getElementById('filtro-fecha-historial').value;
  const tbody = document.getElementById('tabla-historial-completo');
  if (!tbody) return;
  tbody.innerHTML = '';

  let query = db.collection('registros').where('usuariaId', '==', usuarioActual.id).orderBy('fecha', 'desc');
  const snapshot = await query.get();

  snapshot.forEach(doc => {
    const r = doc.data();
    const f = r.fecha ? r.fecha.toDate() : new Date();
    const fechaStr = f.toISOString().split('T')[0];

    if (!inputFecha || inputFecha === fechaStr) {
      tbody.innerHTML += `
        <tr>
          <td>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</td>
          <td><strong>${r.servicioNombre}</strong></td>
          <td>${r.categoria}</td>
          <td><span class="badge">$${r.comisionMonto.toFixed(2)}</span></td>
        </tr>
      `;
    }
  });
}

// Avisos / Alertas en Vivo
function escucharAvisosAdmin() {
  db.collection('avisos').doc('ultimo_aviso').onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data.texto) {
        document.getElementById('alert-msg').innerText = data.texto;
        document.getElementById('alert-banner').style.display = 'block';
      }
    }
  });
}

// ==========================================
// FUNCIONES EXCLUSIVAS ADMIN (NELSON)
// ==========================================
function cargarDatosAdmin() {
  db.collection('usuarios').onSnapshot(snap => {
    const tbody = document.getElementById('tabla-admin-usuarios');
    if (!tbody) return;
    tbody.innerHTML = '';
    snap.forEach(doc => {
      const u = doc.data();
      tbody.innerHTML += `
        <tr>
          <td><strong>${u.nombre}</strong></td>
          <td>${u.login}</td>
          <td>${Array.isArray(u.especialidades) ? u.especialidades.join(', ') : u.especialidades}</td>
          <td><button class="btn btn-danger" style="padding: 4px 8px;" onclick="eliminarEntidad('usuarios', '${doc.id}')">Eliminar</button></td>
        </tr>
      `;
    });
  });

  db.collection('servicios').onSnapshot(snap => {
    const tbody = document.getElementById('tabla-admin-servicios');
    if (!tbody) return;
    tbody.innerHTML = '';
    snap.forEach(doc => {
      const s = doc.data();
      const ganancia = (s.precio * (s.comision / 100)).toFixed(2);
      tbody.innerHTML += `
        <tr>
          <td><span class="badge">${s.categoria}</span></td>
          <td><strong>${s.nombre}</strong></td>
          <td>$${s.precio.toFixed(2)}</td>
          <td>${s.comision}%</td>
          <td>$${ganancia}</td>
          <td><button class="btn btn-danger" style="padding: 4px 8px;" onclick="eliminarEntidad('servicios', '${doc.id}')">Eliminar</button></td>
        </tr>
      `;
    });
  });

  db.collection('registros').orderBy('fecha', 'desc').onSnapshot(snap => {
    const tbody = document.getElementById('tabla-admin-monitoreo');
    if (!tbody) return;
    tbody.innerHTML = '';
    snap.forEach(doc => {
      const r = doc.data();
      const f = r.fecha ? r.fecha.toDate().toLocaleString('es-AR') : '-';
      tbody.innerHTML += `
        <tr>
          <td>${f}</td>
          <td><strong>${r.usuariaNombre}</strong></td>
          <td>${r.servicioNombre}</td>
          <td>$${(r.precioTotal || 0).toFixed(2)}</td>
          <td><span class="badge">$${(r.comisionMonto || 0).toFixed(2)}</span></td>
        </tr>
      `;
    });
  });
}

document.getElementById('form-crear-usuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('nuevo-usr-nombre').value.trim();
  const login = document.getElementById('nuevo-usr-login').value.trim().toLowerCase();
  const pass = document.getElementById('nuevo-usr-pass').value.trim();
  const especialidadesSelect = document.getElementById('nuevo-usr-especialidades').value;
  const especialidades = especialidadesSelect.split(',');

  try {
    await db.collection('usuarios').add({ nombre, login, pass, especialidades });
    document.getElementById('form-crear-usuario').reset();
    alert('Usuaria registrada con éxito.');
  } catch (err) { alert('Error: ' + err.message); }
});

document.getElementById('form-crear-servicio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('serv-nombre').value.trim();
  const categoria = document.getElementById('serv-categoria').value;
  const precio = parseFloat(document.getElementById('serv-precio').value);
  const comision = parseFloat(document.getElementById('serv-comision').value);

  try {
    await db.collection('servicios').add({ nombre, categoria, precio, comision });
    document.getElementById('form-crear-servicio').reset();
    alert('Servicio agregado al catálogo.');
  } catch (err) { alert('Error: ' + err.message); }
});

async function publicarAvisoAdmin() {
  const texto = document.getElementById('admin-aviso-texto').value.trim();
  if (!texto) return;
  await db.collection('avisos').doc('ultimo_aviso').set({ texto, fecha: new Date() });
  document.getElementById('admin-aviso-texto').value = '';
  alert('Aviso difundido a las chicas.');
}

async function eliminarEntidad(col, id) {
  if (confirm('¿Eliminar este registro permanentemente?')) {
    await db.collection(col).doc(id).delete();
  }
}
