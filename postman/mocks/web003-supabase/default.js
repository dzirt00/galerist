// Local Auth/PostgREST fixture, not a database or proof of RLS.
const http = require('http');
const stateKey = 'web003-supabase:state';
const userId = '11111111-1111-4111-8111-111111111111';

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
    const url = new URL(req.url, 'http://fixture.invalid');
    if (req.method === 'POST' && url.pathname === '/__test/reset') {
      await pm.state.set(stateKey, { options: await readBody(req), calls: [] });
      return reply(res, 200, { reset: true });
    }
    const state = await pm.state.get(stateKey);
    if (!state) return reply(res, 409, { error: 'Reset fixture first' });
    if (url.pathname === '/__test/state') return reply(res, 200, state);
    const body = await readBody(req);
    state.calls.push({ method: req.method, path: url.pathname, ...(req.method === 'POST' ? { body } : {}),
      query: Object.fromEntries(url.searchParams),
      authorization: req.headers.authorization, apikey: req.headers.apikey });
    await pm.state.set(stateKey, state);
    const options = state.options;

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/change_seat_count') {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong server credentials' });
      }
      if (options.rpcError) return reply(res, 400, { code: options.rpcError, message: 'Private RPC diagnostic' });
      if ('rpcResult' in options) return reply(res, 200, options.rpcResult);
      const game = (options.games || []).find((item) => item.id === body.p_game_id);
      if (!game || game.creator_id !== body.p_user_id
        || ![2, 3, 4].includes(body.p_seat_count) || body.p_seat_count < game.occupiedSeatCount) {
        return reply(res, 400, { code: 'P0002', message: 'Private capacity refusal' });
      }
      game.seat_count = body.p_seat_count;
      await pm.state.set(stateKey, state);
      return reply(res, 200, { seat_count: game.seat_count });
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_game_list') {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong server credentials' });
      }
      if (Object.keys(body).length || url.searchParams.size) return reply(res, 400, { message: 'Unexpected list parameters' });
      if (options.rpcError) return reply(res, 400, { code: options.rpcError, message: 'Private RPC diagnostic' });
      if ('rpcResult' in options) return reply(res, 200, options.rpcResult);
      return reply(res, 200, (options.games || []).map(({ id, seat_count, occupiedSeatCount, hasPassword }) =>
        ({ id, seat_count, occupiedSeatCount, hasPassword })));
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_game_players') {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong server credentials' });
      }
      if (options.rpcError) return reply(res, 400, { code: options.rpcError, message: 'Private RPC diagnostic' });
      if ('rpcResult' in options) return reply(res, 200, options.rpcResult);
      const members = (options.readyMembers || []).filter((item) => item.gameId === body.p_game_id);
      if (!members.some((item) => item.userId === body.p_user_id)) {
        return reply(res, 404, { code: 'P0002', message: 'Missing membership' });
      }
      return reply(res, 200, members.sort((a, b) => a.userId.localeCompare(b.userId))
        .map((item) => ({ user_id: item.userId, is_ready: item.isReady })));
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/ready_to_game') {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong server credentials' });
      }
      if (options.rpcError) return reply(res, 400, { code: options.rpcError, message: 'Private RPC diagnostic' });
      if ('rpcResult' in options) return reply(res, 200, options.rpcResult);
      const member = (options.readyMembers || []).find((item) =>
        item.gameId === body.p_game_id && item.userId === body.p_user_id);
      if (!member) return reply(res, 404, { code: 'P0002', message: 'Missing membership' });
      member.isReady = body.p_is_ready;
      await pm.state.set(stateKey, state);
      return reply(res, 200, { isReady: member.isReady });
    }

    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/join_game') {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong server credentials' });
      }
      if (options.rpcError) return reply(res, 400, { code: options.rpcError, message: 'Private RPC diagnostic' });
      if ('rpcResult' in options) return reply(res, 200, options.rpcResult);
      const game = (options.games || []).find((item) => item.id === body.p_game_id);
      if (!game) return reply(res, 404, { code: 'P0002', message: 'Missing game' });
      if (!game.members) game.members = [];
      if (!game.members.includes(body.p_user_id)) {
        if (game.hasPassword && body.p_verified_password_hash !== options.passwordHash) {
          return reply(res, 400, { code: 'P1001', message: 'Wrong password' });
        }
        if (game.occupiedSeatCount >= game.seat_count) return reply(res, 400, { code: 'P1002', message: 'Full' });
        game.members.push(body.p_user_id);
        game.occupiedSeatCount++;
        await pm.state.set(stateKey, state);
      }
      const { id, seat_count, occupiedSeatCount, hasPassword } = game;
      return reply(res, 200, { id, seat_count, occupiedSeatCount, hasPassword });
    }

    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      if (options.authStatus) return reply(res, options.authStatus,
        { code: 'fixture_auth_error', msg: 'Private Auth diagnostic' });
      if (req.headers.authorization !== 'Bearer fixture-user-token' || req.headers.apikey !== 'fixture-anon-key') {
        return reply(res, 401, { msg: 'Wrong Auth credentials' });
      }
      return reply(res, 200, { id: userId, aud: 'authenticated', role: 'authenticated',
        email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {},
        created_at: '2026-10-21T00:00:00Z' });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      if (req.headers.authorization !== 'Bearer fixture-service-key' || req.headers.apikey !== 'fixture-service-key') {
        return reply(res, 403, { code: '42501', message: 'Wrong service credentials' });
      }
      const table = url.pathname.slice('/rest/v1/'.length);
      const gameId = url.searchParams.get('game_id')?.replace(/^eq\./, '');
      if (options.readError === table && (!options.errorGameId || options.errorGameId === gameId)) {
        return reply(res, 400, { code: '42501', message: 'Private database diagnostic' });
      }
      // Restrict columns and filters to the agreed safe read contract.
      if (table === 'games') {
        if (url.searchParams.get('select') !== 'id,seat_count' || url.searchParams.size !== 1) {
          return reply(res, 400, { message: 'Unexpected games selection' });
        }
        return reply(res, 200, (options.games || []).map(({ id, seat_count }) => ({ id, seat_count })));
      }
      if (table === 'game_players' || table === 'game_passwords') {
        if (table === 'game_passwords' && url.searchParams.get('select') === 'password_hash') {
          if (options.readError === table) return reply(res, 400, { code: '42501', message: 'Private diagnostic' });
          const game = (options.games || []).find((item) => item.id === gameId);
          return reply(res, 200, game?.hasPassword ? { password_hash: options.passwordHash } : null);
        }
        if (url.searchParams.get('select') !== 'game_id' || !gameId || url.searchParams.size !== 2) {
          return reply(res, 400, { message: 'Unexpected related selection' });
        }
        const game = (options.games || []).find((item) => item.id === gameId);
        const count = !game ? 0 : table === 'game_players' ? game.occupiedSeatCount : Number(game.hasPassword);
        return reply(res, 200, Array.from({ length: count }, () => ({ game_id: gameId })));
      }
    }
    return reply(res, 501, { error: 'Endpoint outside WEB-003 fixture contract' });
  } catch {
    return reply(res, 500, { error: 'Fixture failure' });
  }
}).listen(process.env.PORT);
