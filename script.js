// =============================================
// CONFIGURATION
// =============================================
const CLE_API = "e29bc33a0b4b3d006de72981c5435844";
const URL_BASE = "https://api.openweathermap.org/data/2.5";
const URL_GEO  = "https://api.openweathermap.org/geo/1.0";

// =============================================
// SÉLECTION DES ÉLÉMENTS DU DOM
// =============================================
const inputVille      = document.getElementById("input-ville");
const btnRecherche    = document.getElementById("btn-recherche");
const btnGeo          = document.getElementById("btn-geo");
const zoneErreur      = document.getElementById("erreur");
const msgErreur       = document.getElementById("erreur-message");
const zoneChargement  = document.getElementById("chargement");
const zoneMeteo       = document.getElementById("meteo-principale");
const zonePrevisions  = document.getElementById("previsions");
const fond            = document.getElementById("fond");

// Éléments météo principale
const elVilleNom    = document.getElementById("ville-nom");
const elVilleDate   = document.getElementById("ville-date");
const elIcone       = document.getElementById("meteo-icone");
const elTemp        = document.getElementById("temperature");
const elDesc        = document.getElementById("description");
const elHumidite    = document.getElementById("humidite");
const elVent        = document.getElementById("vent");
const elRessenti    = document.getElementById("ressenti");
const elVisibilite  = document.getElementById("visibilite");
const elPrevisions  = document.getElementById("previsions-grille");

// Éléments prévisions horaires
const zoneHoraires      = document.getElementById("horaires");
const elHorairesOnglets = document.getElementById("horaires-onglets");
const elHorairesTimeline= document.getElementById("horaires-timeline");

// Suggestions de ville
const datalistSuggestions = document.getElementById("city-suggestions");

// =============================================
// ÉTAT INTERNE — données horaires par jour
// =============================================
let donneesHorairesParJour = {}; // { "2025-05-27": [...items...], ... }
let jourActifHoraire = null;     // clé du jour actuellement affiché
let suggestionsTimer = null;
let heureInterval = null;

// =============================================
// CORRESPONDANCE CODE MÉTÉO → EMOJI + FOND
// =============================================
function getInfosMeteo(codeMeteo, estNuit = false) {
  if (codeMeteo >= 200 && codeMeteo < 300) return { icone: "⛈️",  fond: "pluvieux"   };
  if (codeMeteo >= 300 && codeMeteo < 400) return { icone: "🌦️",  fond: "pluvieux"   };
  if (codeMeteo >= 500 && codeMeteo < 600) return { icone: "🌧️",  fond: "pluvieux"   };
  if (codeMeteo >= 600 && codeMeteo < 700) return { icone: "❄️",   fond: "nuageux"    };
  if (codeMeteo >= 700 && codeMeteo < 800) return { icone: "🌫️",  fond: "nuageux"    };
  if (codeMeteo === 800) return estNuit
    ? { icone: "🌙",  fond: "nuit"       }
    : { icone: "☀️",  fond: "ensoleille" };
  if (codeMeteo === 801) return estNuit
    ? { icone: "🌙",  fond: "nuit"       }
    : { icone: "🌤️",  fond: "ensoleille" };
  if (codeMeteo === 802) return { icone: estNuit ? "☁️" : "⛅",  fond: estNuit ? "nuit" : "nuageux" };
  if (codeMeteo >= 803)  return { icone: "☁️",   fond: estNuit ? "nuit" : "nuageux"    };
  return { icone: estNuit ? "🌙" : "🌡️", fond: estNuit ? "nuit" : "nuageux" };
}

// =============================================
// FORMATER LA DATE EN FRANÇAIS
// =============================================
function formaterDate(timestamp, decalageSecondes = 0) {
  const date = new Date((timestamp + decalageSecondes) * 1000);
  return date.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit"
  });
}

function formaterJour(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("fr-FR", { weekday: "short" });
}

// Renvoie "HH:MM" pour un timestamp unix
function formaterHeure(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Renvoie la clé de jour "YYYY-MM-DD" locale pour un timestamp unix
function clejour(timestamp) {
  const d = new Date(timestamp * 1000);
  // Construire la clé en local pour éviter les décalages UTC
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Renvoie un libellé court "Auj." ou "Mar. 27" pour un onglet
function libellOnglet(cle, index) {
  if (index === 0) return "Aujourd'hui";
  const [annee, mois, jour] = cle.split("-");
  const date = new Date(Number(annee), Number(mois) - 1, Number(jour));
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

function mettreAJourHeure(timezoneOffset) {
  const maintenant = Math.floor(Date.now() / 1000);
  elVilleDate.textContent = formaterDate(maintenant, timezoneOffset);
}

// =============================================
// AFFICHER / MASQUER LES ZONES
// =============================================
function afficherChargement() {
  zoneChargement.hidden = true; // on garde visible la météo précédente
  zoneChargement.hidden = false;
  zoneMeteo.hidden      = true;
  zonePrevisions.hidden = true;
  zoneHoraires.hidden   = true;
  zoneErreur.hidden     = true;
}

function afficherErreur(message) {
  zoneChargement.hidden = true;
  zoneErreur.hidden     = false;
  msgErreur.textContent = message;
}

function afficherMeteo() {
  zoneChargement.hidden = true;
  zoneMeteo.hidden      = false;
  zonePrevisions.hidden = false;
  zoneHoraires.hidden   = false;
  zoneErreur.hidden     = true;
}

// =============================================
// REQUÊTE MÉTÉO ACTUELLE
// =============================================
async function getMeteoVille(ville) {
  afficherChargement();
  try {
    const reponse = await fetch(
      `${URL_BASE}/weather?q=${encodeURIComponent(ville)}&appid=${CLE_API}&units=metric&lang=fr`
    );
    if (!reponse.ok) throw new Error("Ville introuvable. Vérifie l'orthographe.");
    const data = await reponse.json();
    afficherDonnees(data);
    await getPrevisionsVille(data.coord.lat, data.coord.lon);
    afficherMeteo();
  } catch (erreur) {
    afficherErreur(erreur.message);
  }
}

// =============================================
// REQUÊTE MÉTÉO PAR COORDONNÉES GPS
// =============================================
async function getMeteoCoordonnees(lat, lon) {
  afficherChargement();
  try {
    const reponse = await fetch(
      `${URL_BASE}/weather?lat=${lat}&lon=${lon}&appid=${CLE_API}&units=metric&lang=fr`
    );
    if (!reponse.ok) throw new Error("Impossible de récupérer la météo de votre position.");
    const data = await reponse.json();
    afficherDonnees(data);
    await getPrevisionsVille(lat, lon);
    afficherMeteo();
  } catch (erreur) {
    afficherErreur(erreur.message);
  }
}

// =============================================
// REQUÊTE PRÉVISIONS 5 JOURS (toutes les 3h)
// L'API /forecast renvoie ~40 créneaux de 3h.
// On les utilise pour deux affichages :
//   1. Résumé 5 jours (1 item/jour à midi)
//   2. Détail horaire (tous les items, groupés par jour)
// =============================================
async function getPrevisionsVille(lat, lon) {
  try {
    const reponse = await fetch(
      `${URL_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${CLE_API}&units=metric&lang=fr`
    );
    if (!reponse.ok) throw new Error("Impossible de récupérer les prévisions météo.");
    const data = await reponse.json();

    // ── 1. Résumé 5 jours (item le plus proche de midi par jour) ──────────
    const previsionsParJour = {};
    data.list.forEach(item => {
      const jour = clejour(item.dt);
      const heure = new Date(item.dt * 1000).getHours();
      if (
        !previsionsParJour[jour] ||
        Math.abs(heure - 12) < Math.abs(new Date(previsionsParJour[jour].dt * 1000).getHours() - 12)
      ) {
        previsionsParJour[jour] = item;
      }
    });
    const previsions5j = Object.values(previsionsParJour).slice(0, 5);
    afficherPrevisions(previsions5j);

    // ── 2. Détail horaire — grouper TOUS les items par jour ───────────────
    donneesHorairesParJour = {};
    data.list.forEach(item => {
      const cle = clejour(item.dt);
      if (!donneesHorairesParJour[cle]) donneesHorairesParJour[cle] = [];
      donneesHorairesParJour[cle].push(item);
    });

    // Afficher le premier jour par défaut
    const premierJour = Object.keys(donneesHorairesParJour)[0];
    construireOnglets();
    afficherHoraires(premierJour);

  } catch (erreur) {
    console.warn("Prévisions OpenWeather :", erreur);
    zoneHoraires.hidden   = true;
    zonePrevisions.hidden = false;
    elPrevisions.innerHTML = `
      <div class="erreur" role="status">Prévisions indisponibles pour le moment.</div>
    `;
  }
}

// =============================================
// CONSTRUIRE LES ONGLETS DE JOUR
// =============================================
function construireOnglets() {
  elHorairesOnglets.innerHTML = "";

  Object.keys(donneesHorairesParJour).forEach((cle, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "onglet-jour" + (index === 0 ? " actif" : "");
    btn.textContent = libellOnglet(cle, index);
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", index === 0 ? "true" : "false");

    btn.addEventListener("click", () => {
      // Désactiver tous les onglets
      elHorairesOnglets.querySelectorAll(".onglet-jour").forEach(b => {
        b.classList.remove("actif");
        b.setAttribute("aria-selected", "false");
      });
      // Activer l'onglet cliqué
      btn.classList.add("actif");
      btn.setAttribute("aria-selected", "true");
      // Afficher les créneaux du jour sélectionné
      afficherHoraires(cle);
    });

    elHorairesOnglets.appendChild(btn);
  });
}

// =============================================
// AFFICHER LES CRÉNEAUX HORAIRES D'UN JOUR
// =============================================
function afficherHoraires(cleJour) {
  jourActifHoraire = cleJour;
  elHorairesTimeline.innerHTML = "";

  const items = donneesHorairesParJour[cleJour];
  if (!items || items.length === 0) {
    elHorairesTimeline.innerHTML = `
      <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:1rem;">
        Aucune donnée pour ce jour.
      </p>
    `;
    return;
  }

  // Timestamp actuel pour identifier "maintenant"
  const maintenant = Math.floor(Date.now() / 1000);

  // Trouver le créneau le plus proche de l'heure actuelle (uniquement si c'est aujourd'hui)
  const jourdHui = clejour(maintenant);
  let indexMaintenant = -1;
  if (cleJour === jourdHui) {
    let deltaMin = Infinity;
    items.forEach((item, i) => {
      const delta = Math.abs(item.dt - maintenant);
      if (delta < deltaMin) { deltaMin = delta; indexMaintenant = i; }
    });
  }

  items.forEach((item, index) => {
    const estMaintenant = (index === indexMaintenant);
    const { icone } = getInfosMeteo(item.weather[0].id);
    const heure      = formaterHeure(item.dt);
    const temp       = Math.round(item.main.temp);
    const humidite   = item.main.humidity;
    const vent       = Math.round(item.wind.speed * 10) / 10;
    const condition  = item.weather[0].description;

    const carte = document.createElement("div");
    carte.className = "heure-carte" + (estMaintenant ? " maintenant" : "");
    // Décalage d'animation pour effet de cascade
    carte.style.animationDelay = `${index * 40}ms`;

    carte.innerHTML = `
      ${estMaintenant ? '<span class="badge-maintenant">Maintenant</span>' : ""}
      <span class="heure-label">${heure}</span>
      <span class="heure-icone">${icone}</span>
      <span class="heure-temp">${temp}°C</span>
      <span class="heure-condition">${condition}</span>
      <div class="heure-separateur"></div>
      <div class="heure-details">
        <div class="heure-detail-ligne">💧 ${humidite}%</div>
        <div class="heure-detail-ligne">💨 ${vent} m/s</div>
      </div>
    `;

    elHorairesTimeline.appendChild(carte);
  });

  // Faire défiler jusqu'à "maintenant" si présent
  if (indexMaintenant >= 0) {
    const cartes = elHorairesTimeline.querySelectorAll(".heure-carte");
    const carteMaintenant = cartes[indexMaintenant];
    if (carteMaintenant) {
      // Léger délai pour laisser le DOM se rendre
      setTimeout(() => {
        carteMaintenant.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center"
        });
      }, 150);
    }
  }
}

// =============================================
// SUGGESTIONS DE VILLE (autocomplétion)
// =============================================
function afficherSuggestions(villes) {
  datalistSuggestions.innerHTML = "";
  villes.forEach(ville => {
    const option = document.createElement("option");
    option.value = `${ville.name}${ville.state ? ", " + ville.state : ""}, ${ville.country}`;
    datalistSuggestions.appendChild(option);
  });
}

async function chercherSuggestions(query) {
  if (query.length < 2) { datalistSuggestions.innerHTML = ""; return; }
  try {
    const reponse = await fetch(
      `${URL_GEO}/direct?q=${encodeURIComponent(query)}&limit=5&appid=${CLE_API}`
    );
    if (!reponse.ok) throw new Error("Erreur de récupération des suggestions.");
    const data = await reponse.json();
    afficherSuggestions(data);
  } catch (erreur) {
    console.warn("Suggestions OpenWeather :", erreur);
    datalistSuggestions.innerHTML = "";
  }
}

function debouncerSuggestions(query) {
  clearTimeout(suggestionsTimer);
  suggestionsTimer = setTimeout(() => chercherSuggestions(query), 300);
}

// =============================================
// AFFICHER LES DONNÉES MÉTÉO DANS LE DOM
// =============================================
function afficherDonnees(data) {
  const maintenant = Date.now() / 1000;
  const estNuit    = maintenant < data.sys.sunrise || maintenant > data.sys.sunset;
  const { icone, fond: typeFond } = getInfosMeteo(data.weather[0].id, estNuit);

  // Fond animé
  fond.className = `fond-anime ${typeFond}`;

  // Horloge en temps réel avec fuseau de la ville
  const timezoneOffset = data.timezone || 0;
  if (heureInterval) clearInterval(heureInterval);
  mettreAJourHeure(timezoneOffset);
  heureInterval = setInterval(() => mettreAJourHeure(timezoneOffset), 60000);

  // Remplir les éléments HTML
  elVilleNom.textContent   = `${data.name}, ${data.sys.country}`;
  elIcone.textContent      = icone;
  elTemp.textContent       = Math.round(data.main.temp);
  elDesc.textContent       = data.weather[0].description;
  elHumidite.textContent   = `${data.main.humidity}%`;
  elVent.textContent       = `${Math.round(data.wind.speed)} m/s`;
  elRessenti.textContent   = `${Math.round(data.main.feels_like)}°C`;
  elVisibilite.textContent = data.visibility
    ? `${(data.visibility / 1000).toFixed(1)} km`
    : "N/A";
}

// =============================================
// AFFICHER LES PRÉVISIONS 5 JOURS
// =============================================
function afficherPrevisions(previsions) {
  elPrevisions.innerHTML = "";
  previsions.forEach(item => {
    const { icone } = getInfosMeteo(item.weather[0].id);
    const jour    = formaterJour(item.dt);
    const tempMax = Math.round(item.main.temp_max);
    const tempMin = Math.round(item.main.temp_min);

    const carte = document.createElement("div");
    carte.className = "prevision-carte";
    carte.innerHTML = `
      <span class="prevision-jour">${jour}</span>
      <span class="prevision-icone">${icone}</span>
      <span class="prevision-temp">${tempMax}°</span>
      <span class="prevision-min">${tempMin}°</span>
    `;
    elPrevisions.appendChild(carte);
  });
}

// =============================================
// GÉOLOCALISATION
// =============================================
function geoLocaliser() {
  if (!navigator.geolocation) {
    afficherErreur("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }
  afficherChargement();
  navigator.geolocation.getCurrentPosition(
    (position) => {
      getMeteoCoordonnees(position.coords.latitude, position.coords.longitude);
    },
    () => {
      afficherErreur("Accès à la position refusé. Recherche une ville manuellement.");
    }
  );
}

// =============================================
// ÉVÉNEMENTS
// =============================================
btnRecherche.addEventListener("click", () => {
  const ville = inputVille.value.trim();
  if (ville) getMeteoVille(ville);
});

inputVille.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const ville = inputVille.value.trim();
    if (ville) getMeteoVille(ville);
  }
});

inputVille.addEventListener("input", (e) => {
  debouncerSuggestions(e.target.value.trim());
});

btnGeo.addEventListener("click", geoLocaliser);

// =============================================
// DÉMARRAGE — charger Abidjan par défaut
// =============================================
getMeteoVille("Abidjan");