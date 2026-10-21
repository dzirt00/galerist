// Local test fixture for the Auth/PostgREST calls used by create-game.
// This models HTTP responses, not PostgreSQL transactions or RLS.
const http = require('http');
const crypto = require('crypto');
const userId = '11111111-1111-4111-8111-111111111111';
const stateKey = 'web002-supabase:state';

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body !== undefined) return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

http.createServer(async (req, res) => {
  try {
    const bodyPromise = readBody(req);
    const url = new URL(req.url, 'http://fixture.invalid');
    if (req.method === 'POST' && url.pathname === '/__test/reset') {
      const options = await bodyPromise;
      await pm.state.set(stateKey, { options, calls: [], games: {}, requests: {} });
      return reply(res, 200, { reset: true });
    }
    const state = await pm.state.get(stateKey);
    if (!state) return reply(res, 409, { error: 'Reset fixture first' });
    if (url.pathname === '/__test/state') return reply(res, 200, state);
    const body = await bodyPromise;
    const call = {
      method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
      authorization: req.headers.authorization, apikey: req.headers.apikey, body,
    };
    state.calls.push(call);
    await pm.state.set(stateKey, state);
    const options = state.options;

    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      if (options.authStatus) {
        return reply(res, options.authStatus, { code: 'fixture_auth_error', msg: 'Private fixture diagnostic' });
      }
      if (options.noUser) return reply(res, 401, { code: 'session_not_found', msg: 'Session no longer exists' });
      if (req.headers.authorization !== 'Bearer fixture-user-token' || req.headers.apikey !== 'fixture-anon-key') {
        return reply(res, 401, { msg: 'Wrong Auth credentials' });
      }
      return reply(res, 200, { id: userId, aud: 'authenticated', role: 'authenticated',
        email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {},
        created_at: '2026-10-21T00:00:00Z' });
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong service credentials' });
      }
      if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/create_game') {
        if (options.rpcError) return reply(res, 400, { code: '23503', message: 'Private database diagnostic' });
        if ('rpcResult' in options) return reply(res, 200, options.rpcResult);
        const requestKey = `${body.p_creator_id}:${body.p_request_id}`;
        let id = state.requests[requestKey];
        if (!id) {
          id = crypto.randomUUID();
          state.requests[requestKey] = id;
          state.games[id] = { id, creator_id: body.p_creator_id, seat_count: body.p_seat_count,
            password_hash: body.p_password_hash };
          await pm.state.set(stateKey, state);
        }
        return reply(res, 200, id);
      }
      if (req.method === 'GET') {
        const table = url.pathname.slice('/rest/v1/'.length);
        if (options.readError === table) return reply(res, 400, { code: '42501', message: 'Private read diagnostic' });
        const filter = url.searchParams.get(table === 'games' ? 'id' : 'game_id');
        const game = state.games[filter?.replace(/^eq\./, '')];
        if (table === 'games') {
          if (options.noGame || !game) return reply(res, 406, { code: 'PGRST116', message: 'No rows' });
          return reply(res, 200, { id: game.id, creator_id: game.creator_id, seat_count: game.seat_count });
        }
        if (table === 'game_players') return reply(res, 200, game ? [{ user_id: game.creator_id }] : []);
        if (table === 'game_passwords') return reply(res, 200, game?.password_hash ? [{ game_id: game.id }] : []);
      }
    }
    return reply(res, 501, { error: 'Endpoint outside WEB-002 fixture contract' });
  } catch {
    return reply(res, 500, { error: 'Fixture failure' });
  }
}).listen(process.env.PORT);
