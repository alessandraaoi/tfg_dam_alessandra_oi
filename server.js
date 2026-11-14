require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

// Defino una ruta de inicio para probar que la conexión al servidor funcione correctamente
app.get('/start', (req, res) => {
  res.send('hello');
});

app.use(express.json()); // para poder leer los datos enviados en JSON 

// MIDDLEWARE
// Si la petición no tiene body, req.body se convierte en un objeto vacío en vez de asignar un valor undefined
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// MIDDLEWARE
// Verificar que la petición traiga un token válido
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // aquí quedan el id y el rol del usuario
    next(); // el token es válido, entonces se puede acceder a la ruta
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// MIDDLEWARE
// Comprobar que el rol del usuario está entre los roles permitidos
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

// Crear una notificación para cada usuario de un rol
async function notifyRole(role, projectId, message) {
  const users = await prisma.user.findMany({ where: { role: role } });
  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      projectId: projectId,
      message: message,
    })),
  });
}

// GET: ver todos los proyectos
// El impresor solo puede ver los proyectos aprobados, los demás pueden ver todos los proyectos
app.get('/projects', authenticate, async (req, res) => {
  try {
    const where = req.user.role === 'PRINTER' ? { phase: { in: ['APPROVED', 'PRINTED'] } } : {};
    const projects = await prisma.project.findMany({ where: where });
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// GET: historial de cambios de fase de un proyecto
// Mismas reglas de visibilidad: el impresor solo ve proyectos aprobados e impresos
app.get('/projects/:id/history', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findUnique({ where: { id: id } });
    if (!project || (req.user.role === 'PRINTER' && !['APPROVED', 'PRINTED'].includes(project.phase))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const history = await prisma.projectHistory.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { username: true, role: true } } },
    });

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching the project history' });
  }
});

// POST: crear un nuevo proyecto
app.post('/projects', authenticate, authorize('DESIGNER'), async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !['PACKAGING', 'OFFLINE_MATERIAL', 'DIGITAL_MATERIAL'].includes(type)) {
      return res.status(400).json({ error: 'A name and a valid type are required' });
      }
    const newProject = await prisma.project.create({
      data: {
        name: name,
        type: type,
      },
    });
    res.status(201).json(newProject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating a new project' });
  }
});

// GET: ver un proyecto concreto por su id
// El impresor solo puede ver los proyectos aprobados
app.get('/projects/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findUnique({
      where: { id: id },
    });

    // 404 si no existe, o si el usuario es impresor y el proyecto no está aprobado
    if (!project || (req.user.role === 'PRINTER' && !['APPROVED', 'PRINTED'].includes(project.phase))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching the project' });
  }
});

// PUT: editar un proyecto
app.put('/projects/:id', authenticate, authorize('DESIGNER'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findUnique({ where: { id: id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Los miembros con rol Design solo pueden editar mientras el proyecto está en fase diseño
    if (project.phase !== 'DESIGN') {
      return res.status(409).json({ error: 'Only projects in design phase can be edited' });
    }

    const { name, type } = req.body;
    const updatedProject = await prisma.project.update({
      where: { id: id },
      data: { name: name, type: type },
    });

    res.json(updatedProject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating the project' });
  }
});

// DELETE: eliminar un proyecto
app.delete('/projects/:id', authenticate, authorize('DESIGNER'),async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    await prisma.project.delete({
      where: { id: id },
    });

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Project not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error deleting the project' });
  }
});

// PATCH: avanzar un proyecto a la siguiente fase
app.patch('/projects/:id/advance', authenticate, authorize('DESIGNER', 'REGULATORY', 'PRINTER'), async (req, res) => {
    try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await prisma.project.findUnique({ where: { id: id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Para cada fase: qué rol puede avanzarla y a qué fase pasa
    const transitions = {
      DESIGN: { role: 'DESIGNER', next: 'REVIEW' },
      REVIEW: { role: 'REGULATORY', next: 'APPROVED' },
      APPROVED: { role: 'PRINTER', next: 'PRINTED' },
    };

    const transition = transitions[project.phase];

    // Si la fase no está en la tabla, es PRINTED y no existe una siguiente fase
    if (!transition) {
    return res.status(400).json({ error: 'Project is already completed' });
    }   

    if (req.user.role !== transition.role) {
      return res.status(403).json({ error: 'Your role cannot advance this phase' });
    }

    const updatedProject = await prisma.project.update({
      where: { id: id },
      data: {
        phase: transition.next,
        reviewNote: null, // al reenviar a revisión, se borra el comentario anterior
      },
    });

    // Registro el cambio de fase en el historial
    await prisma.projectHistory.create({
      data: {
        projectId: id,
        userId: req.user.id,
        fromPhase: project.phase,
        toPhase: transition.next,
      },
    });

    // Enviar notificaciones a los usuarios del nuevo rol (al rol que le toca actuar)
      if (transition.next === 'REVIEW') {
        await notifyRole('REGULATORY', id, `Project "${project.name}" is waiting for review`);
      } else if (transition.next === 'APPROVED') {
        await notifyRole('PRINTER', id, `Project "${project.name}" has been approved and is ready to print`);
      } else if (transition.next === 'PRINTED') {
        await notifyRole('DESIGNER', id, `Project "${project.name}" has been printed`);
      }

    res.json(updatedProject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error advancing the project' });
  }
});

// PATCH: devolver un proyecto de la fase de revisión a diseño, con un comentario obligatorio
app.patch('/projects/:id/return', authenticate, authorize('REGULATORY'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const { reviewNote } = req.body;
    if (!reviewNote || reviewNote.trim() === '') {
      return res.status(400).json({ error: 'A comment is required to return a project' });
    }

    const project = await prisma.project.findUnique({ where: { id: id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Solo se puede devolver un proyecto que está en revisión
    if (project.phase !== 'REVIEW') {
      return res.status(409).json({ error: 'Only projects in review can be returned' });
    }

    const updatedProject = await prisma.project.update({
      where: { id: id },
      data: { phase: 'DESIGN', reviewNote: reviewNote.trim() },
    });

    // Registro el cambio en el historial
    await prisma.projectHistory.create({
      data: {
        projectId: id,
        userId: req.user.id,
        fromPhase: project.phase,
        toPhase: 'DESIGN',
        comment: reviewNote.trim(),
      },
    });

    // Enviar notificación al rol DESIGNER
    await notifyRole('DESIGNER', id, `Project "${project.name}" has been returned to design`);

    res.json(updatedProject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error returning the project' });
  }
});

// PATCH: guardar la URL del archivo de diseño de un proyecto
// Solo Diseño, y solo mientras el proyecto está en fase diseño
app.patch('/projects/:id/file', authenticate, authorize('DESIGNER'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    // La URL debe ser un enlace de la cuenta Cloudinary
    const { fileUrl } = req.body;
    const allowedPrefix = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
    if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith(allowedPrefix)) {
      return res.status(400).json({ error: 'A valid Cloudinary file URL is required' });
    }

    const project = await prisma.project.findUnique({ where: { id: id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.phase !== 'DESIGN') {
      return res.status(409).json({ error: 'Files can only be uploaded while the project is in design phase' });
    }

    // Se guarda la URL nueva: sustituye a la anterior
    const updatedProject = await prisma.project.update({
      where: { id: id },
      data: { fileUrl: fileUrl },
    });

    res.json(updatedProject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error saving the file URL' });
  }
});


// GET: mostrar notificaciones no leídas del usuario que ha iniciado sesión
app.get('/notifications', authenticate, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id, readAt: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching notifications' });
  }
});

// PATCH: marcar una notificación como leída
app.patch('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    // Solo se actualiza si la notificación es de este usuario y todavía no estaba leída
    const result = await prisma.notification.updateMany({
      where: { id: id, userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error updating the notification' });
  }
});

// POST: registrar un usuario nuevo
app.post('/register', async (req, res) => {
  try {
    const { username, password, role, accessCode } = req.body;

      if (!username || !password || !role || !accessCode) {
        return res.status(400).json({ error: 'username, password, role and accessCode are required' });
      }

      if (!['DESIGNER', 'REGULATORY', 'PRINTER'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

    // El rol solo se concede si el código de acceso coincide con el de ese rol
    const roleCodes = {
      DESIGNER: process.env.DESIGNER_CODE,
      REGULATORY: process.env.REGULATORY_CODE,
      PRINTER: process.env.PRINTER_CODE,
    };
    if (accessCode !== roleCodes[role]) {
      return res.status(403).json({ error: 'Invalid access code for this role' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: username },
    });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Generar el hash de la contraseña antes de guardarla
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username: username,
        password: hashedPassword,
        role: role,
      },
    });

    // Devolver el usuario SIN contraseña
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error registering the user' });
  }
});

// POST: iniciar sesión
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username },
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Comparar la contraseña escrita con el hash guardado
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Crear el token con el id y el rol del usuario
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token: token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error logging in' });
  }
});

app.listen(PORT, () => {
  console.log(`Starting server in http://localhost:${PORT}`);
});