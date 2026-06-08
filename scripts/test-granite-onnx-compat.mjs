/**
 * Test de compatibilité transformers.js pour philipp-zettl/granite-embedding-97m-multilingual-r2-ONNX
 *
 * Vérifie :
 * 1. Chargement du modèle (architecture reconnue ?)
 * 2. Dimensions de sortie (attendu : 384)
 * 3. Qualité sémantique : phrases similaires > phrases dissemblables
 * 4. Performance multilingue : français proche du même contenu en anglais
 * 5. Temps d'inférence
 */

import { pipeline, env } from '@huggingface/transformers';

env.cacheDir = '/tmp/hf-cache-granite-test';
env.allowLocalModels = false;

const MODEL_ID = 'philipp-zettl/granite-embedding-97m-multilingual-r2-ONNX';
const CURRENT_MODEL_ID = 'Xenova/multilingual-e5-small';

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toArray(tensor) {
  if (typeof tensor.tolist === 'function') return tensor.tolist().flat(Infinity);
  if (Array.isArray(tensor)) {
    let arr = tensor;
    while (Array.isArray(arr[0])) arr = arr[0];
    return arr;
  }
  return Array.from(tensor.data || tensor);
}

async function testModel(modelId, dtype = 'q8') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Modèle : ${modelId} (dtype=${dtype})`);
  console.log('='.repeat(60));

  let extractor;
  try {
    const t0 = Date.now();
    extractor = await pipeline('feature-extraction', modelId, { dtype });
    console.log(`✅ Chargement OK (${Date.now() - t0} ms)`);
  } catch (err) {
    console.log(`❌ Chargement ÉCHOUÉ : ${err.message}`);
    return null;
  }

  // Phrases de test (domaine parlementaire français)
  const sentences = [
    'query: Quelle est la position du député sur la réforme des retraites ?',
    'passage: Scrutin sur la réforme des retraites : le député a voté Pour.',
    'passage: Scrutin sur le budget de la santé : le député a voté Contre.',
    'passage: Vote on pension reform: the deputy voted in favour.',  // même sens en anglais
    'passage: Le projet de loi sur l\'immigration a été rejeté.',
  ];

  const results = [];
  for (const s of sentences) {
    const t0 = Date.now();
    try {
      const out = await extractor(s, { pooling: 'mean', normalize: true });
      const vec = toArray(out);
      results.push({ sentence: s.slice(0, 60), vec, ms: Date.now() - t0 });
      console.log(`  dim=${vec.length}  norme≈${Math.sqrt(vec.reduce((a,v)=>a+v*v,0)).toFixed(3)}  (${Date.now()-t0} ms)  "${s.slice(0,50)}…"`);
    } catch (err) {
      console.log(`❌ Inférence ÉCHOUÉE : ${err.message}`);
      return null;
    }
  }

  const dims = results[0].vec.length;
  console.log(`\n📐 Dimensions : ${dims} (attendu 384 : ${dims === 384 ? '✅' : '❌'})`);

  // Test sémantique
  const simPertinent = cosineSimilarity(results[0].vec, results[1].vec);  // query vs passage pertinent
  const simHorsSujet = cosineSimilarity(results[0].vec, results[2].vec);  // query vs passage hors-sujet
  const simCrossLang  = cosineSimilarity(results[1].vec, results[3].vec);  // FR vs EN même sens
  const simDifferent  = cosineSimilarity(results[1].vec, results[4].vec);  // retraites vs immigration

  console.log('\n📊 Qualité sémantique :');
  console.log(`  Query "retraites" ↔ Passage "retraites" (FR) : ${simPertinent.toFixed(3)} ${simPertinent > 0.7 ? '✅' : simPertinent > 0.5 ? '⚠️' : '❌'}`);
  console.log(`  Query "retraites" ↔ Passage "santé"            : ${simHorsSujet.toFixed(3)} ${simHorsSujet < simPertinent ? '✅' : '❌'} (doit être < ci-dessus)`);
  console.log(`  Passage "retraites" FR ↔ EN (cross-langue)     : ${simCrossLang.toFixed(3)} ${simCrossLang > 0.7 ? '✅' : simCrossLang > 0.5 ? '⚠️' : '❌'}`);
  console.log(`  Passage "retraites" ↔ "immigration"             : ${simDifferent.toFixed(3)} ${simDifferent < 0.85 ? '✅' : '❌'} (doit être < retraites-retraites)`);

  const avgMs = results.reduce((s, r) => s + r.ms, 0) / results.length;
  console.log(`\n⏱  Temps moyen par phrase : ${avgMs.toFixed(0)} ms`);

  return { dims, simPertinent, simHorsSujet, simCrossLang, avgMs };
}

async function main() {
  console.log('=== Test compatibilité Granite Embedding 97M r2 ONNX ===\n');

  // Test du modèle candidat
  const granite = await testModel(MODEL_ID, 'q8');

  // Comparaison avec le modèle actuel
  console.log('\n\n--- Comparaison avec le modèle actuel ---');
  const current = await testModel(CURRENT_MODEL_ID, 'q8');

  if (granite && current) {
    console.log('\n\n📋 RÉSUMÉ COMPARATIF');
    console.log('─'.repeat(50));
    console.log(`                     Granite R2    e5-small`);
    console.log(`Dimensions           ${granite.dims}           ${current.dims}`);
    console.log(`Sim. pertinent       ${granite.simPertinent.toFixed(3)}         ${current.simPertinent.toFixed(3)}`);
    console.log(`Sim. hors-sujet      ${granite.simHorsSujet.toFixed(3)}         ${current.simHorsSujet.toFixed(3)}`);
    console.log(`Cross-langue FR/EN   ${granite.simCrossLang.toFixed(3)}         ${current.simCrossLang.toFixed(3)}`);
    console.log(`Temps moyen (ms)     ${granite.avgMs.toFixed(0)}            ${current.avgMs.toFixed(0)}`);

    const winner = granite.simPertinent > current.simPertinent ? 'Granite R2' : 'e5-small';
    console.log(`\n🏆 Meilleure similarité pertinente : ${winner}`);
  } else if (!granite) {
    console.log('\n❌ Granite R2 non fonctionnel avec transformers.js — attendre onnx-community.');
  }
}

main().catch(console.error);
