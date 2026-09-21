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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.log('SW error:', e));
}

let usuarioActual = null;
let listaServiciosCache = [];
let registrosLocalesHoy = [];
let categoriaActiva = 'TODOS';

function iniciarReloj() {
  setInterval(() => {
    const ahora = new Date();
    document.getElementById('clock-date').innerText = ahora.toLocaleDateString('es-AR');
    document.getElementById('clock-time').innerText = ahora.toLocaleTimeString('es-AR');
  }, 1000);
}
iniciarReloj();

// AUTENTICACIÓN
document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userInput = document.getElementById('login-user').value.trim().toLowerCase();
      const passInput = document.getElementById('login-pass').value.trim();

      if ((userInput === 'admin' && passInput === 'admin123') || (userInput === 'nel' && passInput === 'nel2026abc')) {
        usuarioActual = { id: 'admin', nombre: 'Nelson (Admin)', login: userInput, rol: 'admin', especialidades: ['Manicura','Pedicuria','Depilacion','Otros'] };
        iniciarSesionUI();
        return;
      }

      try {
        const q = await db.collection('usuarios').where('login', '==', userInput).where('pass', '==', passInput).get();
        if (!q.empty) {
          const doc = q.docs[0];
          usuarioActual = { id: doc.id, ...doc.data(), rol: 'usuaria' };
          iniciarSesionUI();
        } else {
          alert('Usuario o contraseña incorrectos.');
        }
      } catch (err) { alert('Error de conexión: ' + err.message); }
    });
  }
});

function iniciarSesionUI() {
  document.getElementById('sec-login').style.display = 'none';
  document.getElementById('main-nav').style.display = 'grid';
  document.getElementById('user-role-label').innerText = `${usuarioActual.nombre}`;

  if (usuarioActual.rol === 'admin') {
    document.getElementById('nav-admin').style.display = 'block';
    verSeccion('admin');
    cargarAdminForms();
  } else {
    document.getElementById('nav-admin').style.display = 'none';
    verSeccion('servicios');
    escucharServicios();
    escucharRegistrosUsuaria();
  }
}

function verSeccion(sec) {
  document.getElementById('sec-servicios').style.display = sec === 'servicios' ? 'block' : 'none';
  document.getElementById('sec-adelantos').style.display = sec === 'adelantos' ? 'block' : 'none';
  document.getElementById('sec-cobrar').style.display = sec === 'cobrar' ? 'block' : 'none';
  document.getElementById('sec-admin').style.display = sec === 'admin' ? 'block' : 'none';

  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  const btnActivo = document.getElementById(`nav-${sec}`);
  if (btnActivo) btnActivo.classList.add('active');
}

// CATÁLOGO Y TARJETAS
function escucharServicios() {
  db.collection('servicios').onSnapshot(snapshot => {
    listaServiciosCache = [];
    snapshot.forEach(doc => listaServiciosCache.push({ id: doc.id, ...doc.data() }));
    renderizarServicios();
  });
}

function filtrarCategoria(cat, ev) {
  categoriaActiva = cat;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  if (ev) ev.target.classList.add('active');
  renderizarServicios();
}

function filtrarServiciosExpress() { renderizarServicios(); }

function renderizarServicios() {
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

  filtrados.forEach(s => {
    const ganancia = Number(s.precio * (s.comision / 100));
    container.innerHTML += `
      <div class="service-card" onclick="registrarServicioRapido('${s.id}', '${s.nombre}', ${s.precio}, ${ganancia}, '${s.categoria}')">
        <h4>${s.nombre}</h4>
        <div class="price-tag">$${ganancia.toFixed(2)}</div>
      </div>
    `;
  });
}

// REGISTRO Y BORRADO INSTANTÁNEO (OPTIMISTIC)
async function registrarServicioRapido(id, nombre, precio, comisionMonto, categoria) {
  if (usuarioActual.jornadaCerrada) return alert('La jornada de hoy ya fue cerrada.');

  try {
    await db.collection('registros').add({
      usuariaId: usuarioActual.id,
      usuariaNombre: usuarioActual.nombre,
      servicioId: id,
      servicioNombre: nombre,
      categoria: categoria,
      precioTotal: Number(precio),
      comisionMonto: Number(comisionMonto),
      fecha: new Date()
    });
  } catch (err) { alert('Error al registrar: ' + err.message); }
}

// ELIMINACIÓN INSTANTÁNEA SIN ESPERAR RESPUESTA LENTA
async function eliminarRegistroOptimista(docId) {
  const elem = document.getElementById(`reg-${docId}`);
  if (elem) elem.classList.add('deleting');

  setTimeout(async () => {
    try {
      await db.collection('registros').doc(docId).delete();
    } catch (err) {
      alert('No se pudo borrar: ' + err.message);
      if (elem) elem.classList.remove('deleting');
    }
  }, 150);
}

// REGISTROS, ADELANTOS Y COBROS
function escucharRegistrosUsuaria() {
  const hoyInicio = new Date();
  hoyInicio.setHours(0,0,0,0);

  const ahora = new Date();
  const diaSemana = ahora.getDay();
  const diffLunes = ahora.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
  const inicioSemana = new Date(ahora.setDate(diffLunes));
  inicioSemana.setHours(0,0,0,0);

  db.collection('registros')
    .where('usuariaId', '==', usuarioActual.id)
    .orderBy('fecha', 'desc')
    .onSnapshot(snapshot => {
      let totalHoy = 0;
      let totalSemana = 0;
      const containerHoy = document.getElementById('lista-hoy-servicios');
      const containerDesglose = document.getElementById('lista-desglose-semanal');
      if (containerHoy) containerHoy.innerHTML = '';
      if (containerDesglose) containerDesglose.innerHTML = '';

      const diasNombres = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
      const desgloseDias = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      snapshot.forEach(doc => {
        const r = doc.data();
        const f = r.fecha ? r.fecha.toDate() : new Date();
        const comision = Number(r.comisionMonto || 0);

        if (f >= inicioSemana) {
          totalSemana += comision;
          const numDia = f.getDay();
          if (desgloseDias[numDia] !== undefined) desgloseDias[numDia] += comision;
        }

        if (f >= hoyInicio) {
          totalHoy += comision;
          if (containerHoy) {
            containerHoy.innerHTML += `
              <div class="history-item" id="reg-${doc.id}">
                <div class="history-item-info">
                  <h5>${r.servicioNombre}</h5>
                  <small>${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})} • ${r.categoria}</small>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-weight: bold; color: #FF94CA;">$${comision.toFixed(2)}</span>
                  <button class="btn-delete" onclick="eliminarRegistroOptimista('${doc.id}')">❌ Borrar</button>
                </div>
              </div>
            `;
          }
        }
      });

      document.getElementById('sum-dia-top').innerText = `$${totalHoy.toFixed(2)}`;

      for (let d = 1; d <= 6; d++) {
        if (containerDesglose) {
          containerDesglose.innerHTML += `
            <div class="history-item">
              <div class="history-item-info"><h5>${diasNombres[d]}</h5></div>
              <span style="font-weight: bold;">$${desgloseDias[d].toFixed(2)}</span>
            </div>
          `;
        }
      }

      usuarioActual.totalSemana = totalSemana;
      actualizarResumenCobro();
    });

  db.collection('adelantos')
    .where('usuariaId', '==', usuarioActual.id)
    .onSnapshot(snapshot => {
      let totalAdelantos = 0;
      const containerAdelantos = document.getElementById('lista-adelantos-semana');
      if (containerAdelantos) containerAdelantos.innerHTML = '';

      snapshot.forEach(doc => {
        const a = doc.data();
        const f = a.fecha ? a.fecha.toDate() : new Date();
        const monto = Number(a.monto || 0);
        totalAdelantos += monto;

        if (containerAdelantos) {
          containerAdelantos.innerHTML += `
            <div class="history-item">
              <div class="history-item-info">
                <h5>Adelanto Solicitado</h5>
                <small>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</small>
              </div>
              <span style="font-weight: bold; color: var(--warning-color);">$${monto.toFixed(2)}</span>
            </div>
          `;
        }
      });

      usuarioActual.totalAdelantos = totalAdelantos;
      actualizarResumenCobro();
    });
}

function actualizarResumenCobro() {
  if (!usuarioActual) return;
  const sem = Number(usuarioActual.totalSemana || 0);
  const ade = Number(usuarioActual.totalAdelantos || 0);
  const neto = sem - ade;

  document.getElementById('res-total-semanal').innerText = `$${sem.toFixed(2)}`;
  document.getElementById('res-total-adelantos').innerText = `$${ade.toFixed(2)}`;
  document.getElementById('res-saldo-neto').innerText = `$${neto.toFixed(2)}`;
}

async function solicitarAdelanto() {
  const input = document.getElementById('monto-adelanto');
  const monto = parseFloat(input.value);
  if (!monto || monto <= 0) return alert('Ingresá un monto válido.');

  try {
    await db.collection('adelantos').add({ usuariaId: usuarioActual.id, usuariaNombre: usuarioActual.nombre, monto: Number(monto), fecha: new Date() });
    input.value = '';
    alert('Adelanto registrado.');
  } catch (err) { alert('Error: ' + err.message); }
}

function cerrarJornadaDiaria() {
  if (confirm('¿Cerrar servicio por hoy?')) {
    usuarioActual.jornadaCerrada = true;
    alert('Jornada finalizada.');
  }
}

function cargarAdminForms() {
  document.getElementById('form-crear-usuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('nuevo-usr-nombre').value.trim();
    const login = document.getElementById('nuevo-usr-login').value.trim().toLowerCase();
    const pass = document.getElementById('nuevo-usr-pass').value.trim();
    const especialidades = document.getElementById('nuevo-usr-especialidades').value.split(',');
    await db.collection('usuarios').add({ nombre, login, pass, especialidades });
    e.target.reset();
    alert('Usuaria guardada.');
  });

  document.getElementById('form-crear-servicio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('serv-nombre').value.trim();
    const categoria = document.getElementById('serv-categoria').value;
    const precio = parseFloat(document.getElementById('serv-precio').value);
    const comision = parseFloat(document.getElementById('serv-comision').value);
    await db.collection('servicios').add({ nombre, categoria, precio, comision });
    e.target.reset();
    alert('Servicio guardado.');
  });
}
