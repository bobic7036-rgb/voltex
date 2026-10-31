const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const fail = (message, status = 400) => json({ error: message }, status);
const uid = () => crypto.randomUUID();

async function verifyTelegram(initData, botToken) {
  if (!botToken || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(botToken));
  const tokenKey = await crypto.subtle.importKey("raw", secret, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", tokenKey, enc.encode(check)));
  const expected = [...sig].map(x=>x.toString(16).padStart(2,"0")).join("");
  if (expected.length !== hash.length) return null;
  let diff = 0; for(let i=0;i<hash.length;i++) diff |= expected.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now()/1000 - authDate > 86400 || authDate > Date.now()/1000 + 60) return null;
  try { const u = JSON.parse(params.get("user") || "{}"); return u.id ? u : null; } catch { return null; }
}
function adminIds(env) { return new Set((env.ADMIN_IDS || "").split(",").map(x=>x.trim()).filter(Boolean)); }
async function writeLog(db, actor, target, action, details = {}) {
  await db.prepare("INSERT INTO logs(actor_id,target_id,action,details) VALUES(?,?,?,?)")
    .bind(String(actor), target == null ? null : String(target), action, JSON.stringify(details)).run();
}
async function getUser(db, id, name) {
  await db.prepare("INSERT OR IGNORE INTO users(telegram_id,username,coins) VALUES(?,?,0)").bind(String(id), name || "Player").run();
  return db.prepare("SELECT telegram_id,username,coins,wallet_address,is_banned,created_at FROM users WHERE telegram_id=?").bind(String(id)).first();
}
async function body(req) { try { return await req.json(); } catch { return {}; } }

export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") return json({ok:true,app:"VOLTEX CASE"});
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  const tg = await verifyTelegram(initData, env.BOT_TOKEN);
  if (!tg) return fail("Telegram session is invalid. Open this app from its Telegram bot.", 401);
  const id = String(tg.id);
  const name = [tg.first_name,tg.last_name].filter(Boolean).join(" ") || tg.username || "Player";
  const user = await getUser(env.DB,id,name);
  if (user.is_banned) return fail("Цей акаунт заблоковано.",403);
  const isAdmin = adminIds(env).has(id);
  const method = request.method;

  if (url.pathname === "/api/me" && method === "GET") {
    const {results: inventory} = await env.DB.prepare("SELECT instance_id AS instanceId,name,rarity,value,emoji,obtained_at AS obtainedAt FROM inventory WHERE telegram_id=? ORDER BY obtained_at DESC").bind(id).all();
    return json({id, name:user.username, coins:user.coins, wallet:user.wallet_address, inventory, isAdmin});
  }
  if (url.pathname === "/api/cases" && method === "GET") {
    const {results: cases} = await env.DB.prepare("SELECT id,name,description,cost FROM cases WHERE active=1 ORDER BY cost,id").all();
    for (const c of cases) {
      const {results} = await env.DB.prepare("SELECT name,rarity,weight FROM rewards WHERE case_id=? ORDER BY weight DESC").bind(c.id).all();
      const total = results.reduce((s,r)=>s+r.weight,0);
      c.odds = results.map(r=>({name:r.name,rarity:r.rarity,chance:`${(r.weight/total*100).toFixed(2)}%`}));
    }
    return json({cases});
  }
  if (url.pathname === "/api/open" && method === "POST") {
    const b = await body(request); const caseId = String(b.caseId || "");
    const c = await env.DB.prepare("SELECT id,name,cost FROM cases WHERE id=? AND active=1").bind(caseId).first();
    if (!c) return fail("Кейс не знайдено",404);
    const {results} = await env.DB.prepare("SELECT id,name,rarity,value,weight,emoji FROM rewards WHERE case_id=?").bind(caseId).all();
    if (!results.length) return fail("У кейсі немає предметів");
    const total = results.reduce((s,r)=>s+r.weight,0);
    const roll = crypto.getRandomValues(new Uint32Array(1))[0] % total;
    let cursor = roll, reward = results[0];
    for (const r of results) { cursor -= r.weight; if(cursor < 0){reward=r;break;} }
    const instance = uid();
    const insert = await env.DB.prepare("INSERT INTO inventory(instance_id,telegram_id,reward_id,name,rarity,value,emoji) VALUES(?,?,?,?,?,?,?)")
      .bind(instance,id,reward.id,reward.name,reward.rarity,reward.value,reward.emoji);
    const debit = await env.DB.prepare("UPDATE users SET coins=coins-?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND coins>=?")
      .bind(c.cost,id,c.cost).run();
    if (!debit.meta.changes) return fail("Недостатньо монет");
    try { await insert.run(); } catch(e) { await env.DB.prepare("UPDATE users SET coins=coins+? WHERE telegram_id=?").bind(c.cost,id).run(); throw e; }
    await writeLog(env.DB,id,id,"case_opened",{caseId,item:reward.name,rarity:reward.rarity,cost:c.cost});
    const fresh = await env.DB.prepare("SELECT coins FROM users WHERE telegram_id=?").bind(id).first();
    return json({item:{instanceId:instance,name:reward.name,rarity:reward.rarity,value:reward.value,emoji:reward.emoji},coins:fresh.coins});
  }
  if (url.pathname === "/api/sell" && method === "POST") {
    const b=await body(request), instance=String(b.instanceId||"");
    const item=await env.DB.prepare("SELECT instance_id,name,value FROM inventory WHERE instance_id=? AND telegram_id=?").bind(instance,id).first();
    if(!item) return fail("Предмет не знайдено",404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM inventory WHERE instance_id=? AND telegram_id=?").bind(instance,id),
      env.DB.prepare("UPDATE users SET coins=coins+?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?").bind(item.value,id)
    ]);
    await writeLog(env.DB,id,id,"item_exchanged",{item:item.name,value:item.value});
    const fresh=await env.DB.prepare("SELECT coins FROM users WHERE telegram_id=?").bind(id).first();
    return json({coins:fresh.coins});
  }
  if (url.pathname === "/api/wallet" && method === "POST") {
    const b=await body(request), address=String(b.address||"");
    if(address.length<20 || address.length>100) return fail("Некоректна адреса гаманця");
    await env.DB.prepare("UPDATE users SET wallet_address=?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?").bind(address,id).run();
    await writeLog(env.DB,id,id,"wallet_linked",{address:address.slice(0,8)+"…"});
    return json({ok:true});
  }
  if (url.pathname.startsWith("/api/admin/")) {
    if(!isAdmin) return fail("Доступ лише для адміністратора",403);
    if(url.pathname==="/api/admin/overview" && method==="GET") {
      const [stats,logs,players] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS users,COALESCE(SUM(coins),0) AS coins FROM users").first(),
        env.DB.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 100").all(),
        env.DB.prepare("SELECT telegram_id,username,coins,is_banned,created_at FROM users ORDER BY created_at DESC LIMIT 100").all()
      ]);
      return json({stats,logs:logs.results.map(x=>({...x,details:JSON.parse(x.details||"{}")})),players:players.results});
    }
    if(url.pathname==="/api/admin/coins" && method==="POST") {
      const b=await body(request), target=String(b.telegramId||""), delta=Number(b.delta);
      if(!target || !Number.isSafeInteger(delta) || delta===0 || Math.abs(delta)>100000000) return fail("Перевір ID та суму");
      const targetUser=await env.DB.prepare("SELECT telegram_id FROM users WHERE telegram_id=?").bind(target).first();
      if(!targetUser) return fail("Гравця не знайдено",404);
      if(delta<0) {
        const r=await env.DB.prepare("UPDATE users SET coins=coins+?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=? AND coins>=?").bind(delta,target,-delta).run();
        if(!r.meta.changes) return fail("У гравця недостатньо монет");
      } else await env.DB.prepare("UPDATE users SET coins=coins+?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?").bind(delta,target).run();
      await writeLog(env.DB,id,target,"admin_coin_adjust",{delta});
      return json({ok:true});
    }
    if(url.pathname==="/api/admin/ban" && method==="POST") {
      const b=await body(request), target=String(b.telegramId||""), banned=b.banned?1:0;
      if(!target) return fail("Вкажи Telegram ID");
      await env.DB.prepare("UPDATE users SET is_banned=?,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?").bind(banned,target).run();
      await writeLog(env.DB,id,target,banned?"admin_ban":"admin_unban");
      return json({ok:true});
    }
    if(url.pathname==="/api/admin/case" && method==="POST") {
      const b=await body(request);
      const caseId=String(b.id||"").slice(0,40), caseName=String(b.name||"").slice(0,60), desc=String(b.description||"").slice(0,160), cost=Number(b.cost);
      if(!/^[a-z0-9_-]+$/.test(caseId)||!caseName||!Number.isSafeInteger(cost)||cost<0||cost>100000000) return fail("Перевір назву, ID та ціну");
      await env.DB.prepare("INSERT INTO cases(id,name,description,cost,active) VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,cost=excluded.cost,active=1")
        .bind(caseId,caseName,desc,cost).run();
      await writeLog(env.DB,id,null,"admin_case_upsert",{caseId,cost});
      return json({ok:true});
    }
    if(url.pathname==="/api/admin/reward" && method==="POST") {
      const b=await body(request), rid=String(b.id||"").slice(0,50), cid=String(b.caseId||""), rname=String(b.name||"").slice(0,60), rarity=String(b.rarity||"Common").slice(0,30), value=Number(b.value), weight=Number(b.weight), emoji=String(b.emoji||"✦").slice(0,4);
      if(!/^[a-zA-Z0-9_-]+$/.test(rid)||!cid||!rname||!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(weight)||weight<1||weight>1000000) return fail("Перевір поля предмета");
      await env.DB.prepare("INSERT INTO rewards(id,case_id,name,rarity,value,weight,emoji) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET case_id=excluded.case_id,name=excluded.name,rarity=excluded.rarity,value=excluded.value,weight=excluded.weight,emoji=excluded.emoji")
        .bind(rid,cid,rname,rarity,value,weight,emoji).run();
      await writeLog(env.DB,id,null,"admin_reward_upsert",{rewardId:rid,caseId:cid,weight});
      return json({ok:true});
    }
    if(url.pathname==="/api/admin/toggle-case" && method==="POST") {
      const b=await body(request), cid=String(b.caseId||""), active=b.active?1:0;
      await env.DB.prepare("UPDATE cases SET active=? WHERE id=?").bind(active,cid).run();
      await writeLog(env.DB,id,null,"admin_case_toggle",{caseId:cid,active});
      return json({ok:true});
    }
  }
  return fail("Not found",404);
 }
};