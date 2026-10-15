import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config/env.ts';

console.log('Connecting to Supabase at:', config.SUPABASE_URL);
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
  const { data: projects, error: pErr } = await supabase.from('projects').select('id, name, status, created_at');
  console.log('=== REAL PROJECTS IN DB ===');
  if (pErr) console.error('Projects Error:', pErr.message);
  else console.log(JSON.stringify(projects, null, 2));

  const { data: episodes, error: eErr } = await supabase.from('episodes').select('id, project_id, episode_number, title, status, created_at');
  console.log('\n=== REAL EPISODES IN DB ===');
  if (eErr) console.error('Episodes Error:', eErr.message);
  else console.log(JSON.stringify(episodes, null, 2));

  const { count: sceneCount, error: sErr } = await supabase.from('scenes').select('id', { count: 'exact', head: true });
  console.log('\n=== SCENES COUNT ===', sceneCount ?? 0);

  const { count: assetCount, error: aErr } = await supabase.from('assets').select('id', { count: 'exact', head: true });
  console.log('=== ASSETS COUNT ===', assetCount ?? 0);

  const { data: latestScenes } = await supabase.from('scenes').select('id, episode_id, scene_number, status, narration_text').limit(3);
  console.log('\n=== SAMPLE SCENES ===');
  console.log(JSON.stringify(latestScenes, null, 2));

  process.exit(0);
}

inspect().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
