const fs = require('fs');

async function downloadJkGeoJson() {
  console.log("Fetching DataMeet 2011 census districts geojson (~40MB)...");
  try {
    const res = await fetch("https://raw.githubusercontent.com/HindustanTimesLabs/shapefiles/master/state_ut/jammu_and_kashmir/district/jammu_and_kashmir_district.geojson");
    if (res.ok) {
        let text = await res.text();
        fs.writeFileSync("jk_districts.geojson", text);
        console.log("Downloaded successfully from HT Labs.");
        return;
    }
  } catch (e) {
    console.log("Failed first URL:", e.message);
  }

  try {
    const res = await fetch("https://raw.githubusercontent.com/geohacker/india/master/district/india_district.geojson");
    let json = await res.json();
    console.log("Loaded all India districts. Filtering J&K...");
    json.features = json.features.filter(f => {
      const state = (f.properties.NAME_1 || f.properties.st_nm || f.properties.STATE || "").toLowerCase();
      return state.includes("jammu") || state.includes("kashmir") || state.includes("ladakh");
    });
    fs.writeFileSync("jk_districts.geojson", JSON.stringify(json));
    console.log("Saved J&K districts filtered geojson. Length: " + json.features.length);
  } catch(e) {
      console.error(e);
  }
}
downloadJkGeoJson();
