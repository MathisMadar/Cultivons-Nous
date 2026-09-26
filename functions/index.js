// À copier dans functions/index.js du dossier local du projet cultivons-nous

const { onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();

// Doit être identique dans index.html et dans les règles
const SECRET_PATH = "Cultivons-26-2dkwq0";
const INSTANCE = "cultivons-nous-default-rtdb";
const TZ = "America/Toronto";
const NAMES = { A: "Clara", B: "Mathis" };

const API_URL = "https://quizzapi.fr/api/v2/quiz";

const CATEGORIES = {
  musique: "Musique",
  culture_generale: "Culture générale",
  art_litterature: "Arts et littérature",
  tv_cinema: "TV et cinéma",
  actu_politique: "Actualités et politique",
  sport: "Sport",
  jeux_videos: "Jeux vidéo",
  histoire: "Histoire",
  geographie: "Géographie",
  science: "Science",
  gastronomie: "Gastronomie"
};

// Catégories jamais tirées au sort. Le libellé reste dans CATEGORIES
// pour afficher correctement une question déjà posée ou personnalisée.
const EXCLUES = ["jeux_videos"];

const COMMON = {
  maxInstances: 3,
  memory: "256MiB",
  timeoutSeconds: 60
};

// Format AAAA-MM-JJ dans le fuseau de Toronto, comme dans l'app
function dateKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

function answered(v) {
  return v !== undefined && v !== null;
}

/* ---------- Envoi des notifications ---------- */

// Envoi en données seules : le service worker construit la notification.
// Une charge "notification" ferait afficher un second avis par Firebase.
async function sendTo(user, title, body) {
  const tokenRef = admin.database().ref(`/${SECRET_PATH}/tokens/${user}`);
  const token = (await tokenRef.get()).val();
  if (!token) return;

  try {
    await admin.messaging().send({
      token: token,
      data: { title: title, body: body }
    });
  } catch (err) {
    const code = err && err.errorInfo && err.errorInfo.code;
    if (code === "messaging/registration-token-not-registered"
        || code === "messaging/invalid-registration-token") {
      // On ne supprime que si le token n'a pas changé entre-temps
      await tokenRef.transaction((current) => (current === token ? null : current));
    } else {
      console.error("Envoi échoué :", err);
    }
  }
}

/* ---------- Question du jour, posée à minuit ---------- */

function melange(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prepareQuestion(quiz) {
  const choix = melange([quiz.answer, ...quiz.badAnswers]);
  return {
    id: quiz.id,
    t: quiz.question,
    c: choix,
    ok: choix.indexOf(quiz.answer),
    cat: quiz.category || "",
    dif: quiz.difficulty || ""
  };
}

// Tire une question jamais posée, dans une catégorie au hasard.
// Pas de filtre de difficulté : les trois niveaux se mélangent.
async function tireQuestion(used) {
  const cats = Object.keys(CATEGORIES).filter(c => !EXCLUES.includes(c));
  const cat = cats[Math.floor(Math.random() * cats.length)];

  const res = await fetch(`${API_URL}?limit=20&category=${cat}`);
  if (!res.ok) throw new Error(`API : réponse ${res.status}`);

  const data = await res.json();
  const libres = (data.quizzes || []).filter((z) =>
    z && z.id && z.question && z.answer
    && Array.isArray(z.badAnswers) && z.badAnswers.length > 0
    && !used[z.id]);

  if (!libres.length) return null;
  return prepareQuestion(libres[Math.floor(Math.random() * libres.length)]);
}

exports.questionDuJour = onSchedule(
  { ...COMMON, schedule: "0 0 * * *", timeZone: TZ, retryCount: 3 },
  async () => {
    const key = dateKey(new Date());
    const qRef = admin.database().ref(`/${SECRET_PATH}/jours/${key}/question`);

    if ((await qRef.get()).exists()) return;

    const used = (await admin.database().ref(`/${SECRET_PATH}/utilisees`).get()).val() || {};

    // Quelques essais, au cas où une catégorie serait épuisée
    for (let essai = 0; essai < 4; essai++) {
      const q = await tireQuestion(used);
      if (!q) continue;

      // N'écrit que si l'app n'a pas déjà posé une question entre-temps
      const result = await qRef.transaction((cur) => cur || q);
      if (result.committed && result.snapshot.val().id === q.id) {
        await admin.database().ref(`/${SECRET_PATH}/utilisees/${q.id}`).set(true);
      }
      return;
    }

    // Une erreur déclenche une nouvelle tentative planifiée
    throw new Error("Aucune question neuve récupérée");
  }
);

/* ---------- Rappel du matin ---------- */

exports.rappelDuMatin = onSchedule(
  { ...COMMON, schedule: "0 9 * * *", timeZone: TZ },
  async () => {
    const key = dateKey(new Date());
    const day = (await admin.database().ref(`/${SECRET_PATH}/jours/${key}`).get()).val() || {};

    const q = day.question;
    const body = q && CATEGORIES[q.cat]
      ? `Catégorie du jour : ${CATEGORIES[q.cat]}`
      : "Une nouvelle question t'attend.";

    // Pas de rappel pour qui a déjà répondu
    const cibles = ["A", "B"].filter((u) => !answered(day[u]));
    await Promise.all(cibles.map((u) => sendTo(u, "La question du jour est là", body)));
  }
);

/* ---------- Réponse de l'autre ---------- */

exports.notifyReponse = onValueCreated(
  { ...COMMON, instance: INSTANCE, ref: `/${SECRET_PATH}/jours/{date}/{user}` },
  async (event) => {
    const user = event.params.user;
    // Le même chemin reçoit aussi la question : on ne garde que les réponses
    if (user !== "A" && user !== "B") return;

    const other = user === "A" ? "B" : "A";
    const otherSnap = await event.data.ref.parent.child(other).get();

    const body = otherSnap.exists()
      ? "Les résultats sont disponibles."
      : "À ton tour de répondre.";

    await sendTo(other, `${NAMES[user]} a répondu`, body);
  }
);
