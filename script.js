// =============================================
// CONFIGURATION
// =============================================
const CLE_API = "e29bc33a0b4b3d006de72981c5435844";
const URL_BASE = "https://api.openweathermap.org/data/2.5";
const URL_GEO = "https://api.openweathermap.org/geo/1.0";

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

// Éléments météo
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
const datalistSuggestions = document.getElementById("city-suggestions");
let suggestionsTimer = null;

// =============================================
// CORRESPONDANCE CODE MÉTÉO → EMOJI + FOND
// L'API renvoie des codes numériques pour chaque
// condition météo. On les convertit en émojis.
// =============================================
function getInfosMeteo(codeMeteo, estNuit = false) {
  if (codeMeteo >= 200 && codeMeteo < 300) return { icone: "⛈️", fond: "pluvieux" };
  if (codeMeteo >= 300 && codeMeteo < 400) return { icone: "🌦️", fond: "pluvieux" };
  if (codeMeteo >= 500 && codeMeteo < 600) return { icone: "🌧️", fond: "pluvieux" };
  if (codeMeteo >= 600 && codeMeteo < 700) return { icone: "❄️", fond: "nuageux" };
  if (codeMeteo >= 700 && codeMeteo < 800) return { icone: "🌫️", fond: "nuageux" };
  if (codeMeteo === 800) return estNuit ? { icone: "🌙", fond: "nuit" } : { icone: "☀️", fond: "ensoleille" };
  if (codeMeteo === 801) return estNuit ? { icone: "🌙", fond: "nuit" } : { icone: "🌤️", fond: "ensoleille" };
  if (codeMeteo === 802) return { icone: estNuit ? "☁️" : "⛅", fond: estNuit ? "nuit" : "nuageux" };
  if (codeMeteo >= 803) return { icone: "☁️", fond: estNuit ? "nuit" : "nuageux" };

  return { icone: estNuit ? "🌙" : "🌡️", fond: estNuit ? "nuit" : "nuageux" };
}

// =============================================
// FORMATER LA DATE EN FRANÇAIS
// =============================================
function formaterDate(timestamp) {
  const date = new Date(timestamp * 1000); // API donne en secondes, JS veut millisecondes
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formaterJour(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("fr-FR", { weekday: "short" });
}

// =============================================
// AFFICHER / MASQUER LES ZONES
// =============================================
function afficherChargement() {
  zoneChargement.hidden = false;
  zoneMeteo.hidden      = true;
  zonePrevisions.hidden = true;
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
  zoneErreur.hidden     = true;
}

// =============================================
// REQUÊTE MÉTÉO ACTUELLE
// C'est ici qu'on utilise fetch + async/await
// =============================================
async function getMeteoVille(ville) {
  afficherChargement();

  try {
    // 1. On envoie la requête à l'API
    const reponse = await fetch(
      `${URL_BASE}/weather?q=${encodeURIComponent(ville)}&appid=${CLE_API}&units=metric&lang=fr`
    );

    // 2. Si la ville n'existe pas, l'API renvoie une erreur
    if (!reponse.ok) {
      throw new Error("Ville introuvable. Vérifie l'orthographe.");
    }

    // 3. On convertit la réponse en objet JavaScript
    const data = await reponse.json();

    // 4. On affiche les données
    afficherDonnees(data);

    // 5. On récupère aussi les prévisions
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
// REQUÊTE PRÉVISIONS 5 JOURS
// =============================================
async function getPrevisionsVille(lat, lon) {
  try {
    const reponse = await fetch(
      `${URL_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${CLE_API}&units=metric&lang=fr`
    );

    if (!reponse.ok) {
      throw new Error("Impossible de récupérer les prévisions météo.");
    }

    const data = await reponse.json();

    // L'API renvoie des prévisions toutes les 3h.
    // On filtre pour garder une seule prévision par jour (à midi).
    const previsionsParJour = {};

    data.list.forEach(item => {
      const date = new Date(item.dt * 1000);
      const jour = date.toDateString();
      const heure = date.getHours();

      // On prend la prévision la plus proche de midi
      if (!previsionsParJour[jour] || Math.abs(heure - 12) < Math.abs(new Date(previsionsParJour[jour].dt * 1000).getHours() - 12)) {
        previsionsParJour[jour] = item;
      }
    });

    // On prend les 5 prochains jours
    const previsions = Object.values(previsionsParJour).slice(0, 5);
    afficherPrevisions(previsions);
  } catch (erreur) {
    console.warn("Prévisions OpenWeather :", erreur);
    zonePrevisions.hidden = false;
    elPrevisions.innerHTML = `
      <div class="erreur" role="status" aria-live="polite">
        Prévisions indisponibles pour le moment.
      </div>
    `;
  }
}

function afficherSuggestions(villes) {
  datalistSuggestions.innerHTML = "";
  villes.forEach(ville => {
    const option = document.createElement("option");
    option.value = `${ville.name}${ville.state ? ", " + ville.state : ""}, ${ville.country}`;
    datalistSuggestions.appendChild(option);
  });
}

async function chercherSuggestions(query) {
  if (query.length < 2) {
    datalistSuggestions.innerHTML = "";
    return;
  }

  try {
    const reponse = await fetch(
      `${URL_GEO}/direct?q=${encodeURIComponent(query)}&limit=5&appid=${CLE_API}`
    );

    if (!reponse.ok) {
      throw new Error("Erreur de récupération des suggestions.");
    }

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
  // Déterminer si c'est la nuit
  const maintenant = Date.now() / 1000;
  const estNuit = maintenant < data.sys.sunrise || maintenant > data.sys.sunset;

  // Obtenir icône et fond selon la météo
  const { icone, fond: typeFond } = getInfosMeteo(data.weather[0].id, estNuit);

  // Mettre à jour le fond animé
  fond.className = `fond-anime ${typeFond}`;

  // Remplir les éléments HTML
  elVilleNom.textContent  = `${data.name}, ${data.sys.country}`;
  elVilleDate.textContent = formaterDate(data.dt);
  elIcone.textContent     = icone;
  elTemp.textContent      = Math.round(data.main.temp);
  elDesc.textContent      = data.weather[0].description;
  elHumidite.textContent  = `${data.main.humidity}%`;
  elVent.textContent      = `${Math.round(data.wind.speed)} m/s`;
  elRessenti.textContent  = `${Math.round(data.main.feels_like)}°C`;
  elVisibilite.textContent = data.visibility ? `${(data.visibility / 1000).toFixed(1)} km` : "N/A";
}

// =============================================
// AFFICHER LES PRÉVISIONS DANS LE DOM
// =============================================
function afficherPrevisions(previsions) {
  elPrevisions.innerHTML = ""; // Vider avant de remplir

  previsions.forEach(item => {
    const { icone } = getInfosMeteo(item.weather[0].id);
    const jour = formaterJour(item.dt);
    const tempMax = Math.round(item.main.temp_max);
    const tempMin = Math.round(item.main.temp_min);

    // Créer la carte HTML pour chaque jour
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
// GÉOLOCALISATION — demander la position GPS
// =============================================
function geoLocaliser() {
  if (!navigator.geolocation) {
    afficherErreur("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }

  afficherChargement();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      // Succès : on a les coordonnées
      getMeteoCoordonnees(position.coords.latitude, position.coords.longitude);
    },
    (erreur) => {
      // Échec : l'utilisateur a refusé ou autre erreur
      afficherErreur("Accès à la position refusé. Recherche une ville manuellement.");
    }
  );
}

// =============================================
// ÉVÉNEMENTS
// =============================================

// Recherche au clic sur le bouton
btnRecherche.addEventListener("click", () => {
  const ville = inputVille.value.trim();
  if (ville) getMeteoVille(ville);
});

// Recherche à l'appui sur Entrée
inputVille.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const ville = inputVille.value.trim();
    if (ville) getMeteoVille(ville);
  }
});

// Suggestions de ville pendant la saisie
inputVille.addEventListener("input", (e) => {
  debouncerSuggestions(e.target.value.trim());
});

// Géolocalisation au clic
btnGeo.addEventListener("click", geoLocaliser);

// =============================================
// DÉMARRAGE — charger Abidjan par défaut
// =============================================
getMeteoVille("Abidjan");