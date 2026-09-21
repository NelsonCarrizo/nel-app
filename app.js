// CONFIGURACIÓN DE FIREBASE
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
let contadorFrecuenciaServicios = {};
let categoriaActiva = 'TODOS';

function iniciarReloj() {
  setInterval(() => {
    const ahora = new Date();
    const elemFecha = document.getElementById('clock-date');
    const elemHora = document.getElementById('clock-time');
    if (elemFecha) elemFecha.innerText = ahora.toLocaleDateString('es-AR');
    if (elemHora) elemHora.innerText = ahora.toLocaleTimeString('es-AR');
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
        usuarioActual = { 
          id: 'admin', 
          nombre: 'Nelson (Admin)', 
          login: userInput, 
          rol: 'admin', 
          especialidades: ['Manicura','Pedicuria','Depilacion','Otros'] 
        };
        iniciarSesionUI();
        return;
      }

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
    verSeccion('servicios');
    escucharServiciosYFrecuencia();
    escucharRegistrosUsuaria();
    escucharAvisosAdmin();
  }
}

function cerrarSesion() {
  usuarioActual = null;
  document.getElementById('sec-login').style.display = 'block';
  document.getElementById('sec-servicios').style.display = 'none';
  document.getElementById('sec-adelantos').style.display = 'none';
  document.getElementById('sec-cobrar').style.display = 'none';
  document.getElementById('sec-admin').style.display = 'none';
  document.getElementById('main-nav').style.display = 'none';
  const formLogin = document.getElementById('form-login');
  if (formLogin) formLogin.reset();
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

// CATÁLOGO Y SERVICIOS
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

  filtrados.forEach((s) => {
    const ganancia = Number(s.precio * (s.comision / 100));

    container.innerHTML += `
      <div class="service-card" onclick="registrarServicioRapido('${s.id}', '${s.nombre}', ${s.precio}, ${ganancia}, '${s.categoria}')">
        <h4>${s.nombre}</h4>
        <small style="color: var(--text-muted); font-size: 0.8em; margin-top: 4px;">${s.categoria}</small>
        <span class="badge-price">$${ganancia.toFixed(2)}</span>
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
      precioTotal: Number(precio),
      comisionMonto: Number(comisionMonto),
      fecha: new Date()
    });

    contadorFrecuenciaServicios[id] = (contadorFrecuenciaServicios[id] || 0) + 1;
    renderizarTarjetasServicios();
  } catch (err) {
    alert('Error al registrar servicio: ' + err.message);
  }
}

async function eliminarRegistroServicio(docId) {
  if (confirm('¿Deseás eliminar este servicio mal cargado? Se descontará del total.')) {
    try {
      await db.collection('registros').doc(docId).delete();
    } catch (err) {
      alert('Error al eliminar registro: ' + err.message);
    }
  }
}

// CÁLCULOS DÍA A DÍA Y COBRO SEMANAL (LUNES A SÁBADO)
function escucharRegistrosUsuaria() {
  const hoyInicio = new Date();
  hoyInicio.setHours(0,0,0,0);

  // Obtener rango de la semana actual (Lunes a Sábado)
  const ahora = new Date();
  const diaSemana = ahora.getDay(); // 0: Dom, 1: Lun...
  const diffLunes = ahora.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
  const inicioSemana = new Date(ahora.setDate(diffLunes));
  inicioSemana.setHours(0,0,0,0);

  db.collection('registros')
    .where('usuariaId', '==', usuarioActual.id)
    .orderBy('fecha', 'desc')
    .onSnapshot(snapshot => {
      let totalHoy = 0;
      let totalSemana = 0;
      const tablaHoy = document.getElementById('tabla-hoy-usuaria');
      const tablaDesglose = document.getElementById('tabla-desglose-semanal');
      
      if (tablaHoy) tablaHoy.innerHTML = '';
      if (tablaDesglose) tablaDesglose.innerHTML = '';

      const diasNombres = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
      const desgloseDias = { 1: {cant:0, subtotal:0}, 2: {cant:0, subtotal:0}, 3: {cant:0, subtotal:0}, 4: {cant:0, subtotal:0}, 5: {cant:0, subtotal:0}, 6: {cant:0, subtotal:0} };

      snapshot.forEach(doc => {
        const r = doc.data();
        const f = r.fecha ? r.fecha.toDate() : new Date();
        const comision = Number(r.comisionMonto || 0);

        // Si pertenece a la semana actual
        if (f >= inicioSemana) {
          totalSemana += comision;
          const numDia = f.getDay();
          if (desgloseDias[numDia]) {
            desgloseDias[numDia].cant++;
            desgloseDias[numDia].subtotal += comision;
          }
        }

        // Si es de hoy (Pestaña 1)
        if (f >= hoyInicio) {
          totalHoy += comision;
          if (tablaHoy) {
            tablaHoy.innerHTML += `
              <tr>
                <td>${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</td>
                <td><strong>${r.servicioNombre}</strong> <small>(${r.categoria})</small></td>
                <td><span class="badge">$${comision.toFixed(2)}</span></td>
                <td><button class="btn-del-item" onclick="eliminarRegistroServicio('${doc.id}')">❌ Borrar</button></td>
              </tr>
            `;
          }
        }
      });

      // Sumatoria arriba a un costado (Pestaña 1)
      const elemSumDia = document.getElementById('sum-dia-top');
      if (elemSumDia) elemSumDia.innerText = `$ ${totalHoy.toFixed(2)}`;

      // Renderizar desglose diario (Pestaña 3)
      for (let d = 1; d <= 6; d++) {
        if (tablaDesglose) {
          tablaDesglose.innerHTML += `
            <tr>
              <td><strong>${diasNombres[d]}</strong></td>
              <td>${desgloseDias[d].cant} servicios</td>
              <td>$${desgloseDias[d].subtotal.toFixed(2)}</td>
            </tr>
          `;
        }
      }

      usuarioActual.totalHoy = totalHoy;
      usuarioActual.totalSemana = totalSemana;
      actualizarTotalesFinanzas();
    });

  // Escuchar Adelantos
  db.collection('adelantos')
    .where('usuariaId', '==', usuarioActual.id)
    .onSnapshot(snapshot => {
      let totalAdelantos = 0;
      const tablaAdelantos = document.getElementById('tabla-adelantos-semana');
      if (tablaAdelantos) tablaAdelantos.innerHTML = '';

      snapshot.forEach(doc => {
        const a = doc.data();
        const f = a.fecha ? a.fecha.toDate() : new Date();
        const monto = Number(a.monto || 0);

        totalAdelantos += monto;

        if (tablaAdelantos) {
          tablaAdelantos.innerHTML += `
            <tr>
              <td>${f.toLocaleDateString('es-AR')} ${f.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</td>
              <td><strong style="color: var(--warning-color);">$ ${monto.toFixed(2)}</strong></td>
            </tr>
          `;
        }
      });

      usuarioActual.totalAdelantos = totalAdelantos;
      actualizarTotalesFinanzas();
    });
}

function actualizarTotalesFinanzas() {
  if (!usuarioActual) return;
  const sem = Number(usuarioActual.totalSemana || 0);
  const ade = Number(usuarioActual.totalAdelantos || 0);
  const neto = sem - ade;

  const elemSem = document.getElementById('res-total-semanal');
  const elemAde = document.getElementById('res-total-adelantos');
  const elemNeto = document.getElementById('res-saldo-neto');

  if (elemSem) elemSem.innerText = `$ ${sem.toFixed(2)}`;
  if (elemAde) elemAde.innerText = `$ ${ade.toFixed(2)}`;
  if (elemNeto) elemNeto.innerText = `$ ${neto.toFixed(2)}`;
}

async function solicitarAdelanto() {
  const input = document.getElementById('monto-adelanto');
  const monto = parseFloat(input.value);
  if (!monto || monto <= 0) return alert('Ingresá un monto válido.');

  try {
    await db.collection('adelantos').add({
      usuariaId: usuarioActual.id,
      usuariaNombre: usuarioActual.nombre,
      monto: Number(monto),
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
    alert('Jornada finalizada correctamente.');
  }
}

function escucharAvisosAdmin() {
  db.collection('avisos').doc('ultimo_aviso').onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      if (data.texto) {
        const elemMsg = document.getElementById('alert-msg');
        const elemBanner = document.getElementById('alert-banner');
        if (elemMsg) elemMsg.innerText = data.texto;
        if (elemBanner) elemBanner.style.display = 'block';
      }
    }
  });
}

// FUNCIONES ADMIN
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
          <td><button class="btn-danger" style="padding: 4px 8px;" onclick="eliminarEntidad('usuarios', '${doc.id}')">Eliminar</button></td>
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
      const ganancia = Number(s.precio * (s.comision / 100));
      tbody.innerHTML += `
        <tr>
          <td><span class="badge">${s.categoria}</span></td>
          <td><strong>${s.nombre}</strong></td>
          <td>$${Number(s.precio).toFixed(2)}</td>
          <td>${s.comision}%</td>
          <td>$${ganancia.toFixed(2)}</td>
          <td><button class="btn-danger" style="padding: 4px 8px;" onclick="eliminarEntidad('servicios', '${doc.id}')">Eliminar</button></td>
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
          <td>${r.servicioNombre} (${r.categoria})</td>
          <td>$${Number(r.precioTotal || 0).toFixed(2)}</td>
          <td><span class="badge">$${Number(r.comisionMonto || 0).toFixed(2)}</span></td>
        </tr>
      `;
    });
  });

  const formCrearUser = document.getElementById('form-crear-usuario');
  if (formCrearUser && !formCrearUser.dataset.listener) {
    formCrearUser.dataset.listener = "true";
    formCrearUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('nuevo-usr-nombre').value.trim();
      const login = document.getElementById('nuevo-usr-login').value.trim().toLowerCase();
      const pass = document.getElementById('nuevo-usr-pass').value.trim();
      const especialidadesSelect = document.getElementById('nuevo-usr-especialidades').value;
      const especialidades = especialidadesSelect.split(',');

      try {
        await db.collection('usuarios').add({ nombre, login, pass, especialidades });
        formCrearUser.reset();
        alert('Usuaria registrada con éxito.');
      } catch (err) { alert('Error: ' + err.message); }
    });
  }

  const formCrearServ = document.getElementById('form-crear-servicio');
  if (formCrearServ && !formCrearServ.dataset.listener) {
    formCrearServ.dataset.listener = "true";
    formCrearServ.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('serv-nombre').value.trim();
      const categoria = document.getElementById('serv-categoria').value;
      const precio = parseFloat(document.getElementById('serv-precio').value);
      const comision = parseFloat(document.getElementById('serv-comision').value);

      try {
        await db.collection('servicios').add({ nombre, categoria, precio, comision });
        formCrearServ.reset();
        alert('Servicio agregado al catálogo.');
      } catch (err) { alert('Error: ' + err.message); }
    });
  }
}

async function publicarAvisoAdmin() {
  const elemAviso = document.getElementById('admin-aviso-texto');
  const texto = elemAviso ? elemAviso.value.trim() : '';
  if (!texto) return;
  await db.collection('avisos').doc('ultimo_aviso').set({ texto, fecha: new Date() });
  if (elemAviso) elemAviso.value = '';
  alert('Aviso difundido a las chicas.');
}

async function eliminarEntidad(col, id) {
  if (confirm('¿Eliminar este registro permanentemente?')) {
    await db.collection(col).doc(id).delete();
  }
}
