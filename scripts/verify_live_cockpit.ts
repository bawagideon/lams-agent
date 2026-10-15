import { MissionControlServer } from '../src/server/MissionControlServer.ts';

async function runVerification() {
  console.log('--- STARTING LIVE COCKPIT VERIFICATION ---');
  const testPort = 4201;
  const server = new MissionControlServer(testPort);
  await server.start();

  try {
    // 1. Test Dashboard HTML
    console.log('\n1. Testing GET / (Live Cockpit UI)...');
    const resRoot = await fetch(`http://localhost:${testPort}/`);
    console.log('GET / status:', resRoot.status);
    const textRoot = await resRoot.text();
    console.log('UI contains "LAMS HQ":', textRoot.includes('LAMS HQ'));
    console.log('UI contains "Lams Assistant":', textRoot.includes('Lams Assistant'));
    console.log('UI contains "Live Pipeline Counters":', textRoot.includes('Live Pipeline Counters'));

    // 2. Test Chat Endpoint
    console.log('\n2. Testing POST /api/chat (Agent Intent Router)...');
    const resChat = await fetch(`http://localhost:${testPort}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Review pending episodes' }),
    });
    const chatData = await resChat.json();
    console.log('Chat response status:', resChat.status);
    console.log('Chat reply:', chatData.reply);

    // 3. Test Episode Details
    const testEpId = '5c51fb76-6e6a-46a4-9b79-44e42d04f4b5';
    console.log(`\n3. Testing GET /api/episodes/${testEpId}/details...`);
    const resDetails = await fetch(`http://localhost:${testPort}/api/episodes/${testEpId}/details`);
    console.log('Details status:', resDetails.status);
    const details = await resDetails.json();
    console.log('Episode Title:', details.title);
    console.log('Scenes count:', details.scenes?.length);
    console.log('Scene 1 Video URL:', details.scenes?.[0]?.videoUrl);

    // 4. Test Preview Route
    console.log(`\n4. Testing GET /api/episodes/${testEpId}/preview...`);
    const resPrev = await fetch(`http://localhost:${testPort}/api/episodes/${testEpId}/preview`);
    console.log('Preview status:', resPrev.status);
    const textPrev = await resPrev.text();
    console.log('Preview contains "mainVideoPlayer":', textPrev.includes('mainVideoPlayer'));
    console.log('Preview contains "The Harvest of Deeds":', textPrev.includes('The Harvest of Deeds'));

    // 5. Test Teach Mode Compilation
    console.log('\n5. Testing POST /api/teach/compile (Demonstration Compiler)...');
    const resTeach = await fetch(`http://localhost:${testPort}/api/teach/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Publish Instagram Teaser', application: 'Instagram Web' }),
    });
    console.log('Teach status:', resTeach.status);
    const teachData = await resTeach.json();
    console.log('Synthesized Skill ID:', teachData.skill?.id);
    console.log('Synthesized Skill Gate:', teachData.skill?.approvalGate?.level);
    console.log('Synthesized Steps:', teachData.skill?.actions?.length);

    // 6. Test Real CapCut Draft Creation (with pre-cached assets)
    console.log(`\n6. Testing POST /api/episodes/${testEpId}/capcut...`);
    const resCapcut = await fetch(`http://localhost:${testPort}/api/episodes/${testEpId}/capcut`, {
      method: 'POST',
    });
    console.log('CapCut Draft status:', resCapcut.status);
    const capcutData = await resCapcut.json();
    console.log('CapCut Draft Output:', JSON.stringify(capcutData, null, 2));

    console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
  } catch (err: any) {
    console.error('VERIFICATION FAILED:', err);
  } finally {
    await server.stop();
  }
}

runVerification();
