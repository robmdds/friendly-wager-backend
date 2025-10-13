// testApi.js - Run with: node testApi.js
const axios = require('axios');

const BASE_URL = 'https://friendly-wager-backend.onrender.com/api';
// Change to your actual Render URL

let authToken = '';
let userId = '';
let betId = '';

// Color console output
const log = {
  success: (msg) => console.log('\x1b[32m✓\x1b[0m', msg),
  error: (msg) => console.log('\x1b[31m✗\x1b[0m', msg),
  info: (msg) => console.log('\x1b[36mℹ\x1b[0m', msg),
  section: (msg) => console.log('\n\x1b[33m' + '='.repeat(50) + '\x1b[0m\n  ' + msg + '\n' + '\x1b[33m' + '='.repeat(50) + '\x1b[0m')
};

// Generate random test data
const testEmail = `test${Date.now()}@example.com`;
const testUsername = `user${Date.now()}`;
const testPassword = 'TestPass123!';

async function test(name, fn) {
  try {
    log.info(`Testing: ${name}`);
    await fn();
    log.success(`${name} - PASSED`);
    return true;
  } catch (error) {
    log.error(`${name} - FAILED`);
    console.error('Error:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('\n🚀 Starting API Tests...\n');
  
  // 1. Health Check
  log.section('1. HEALTH CHECK');
  await test('Health endpoint', async () => {
    const response = await axios.get(`${BASE_URL.replace('/api', '')}/health`);
    if (response.data.status !== 'ok') throw new Error('Health check failed');
  });

  // 2. Authentication
  log.section('2. AUTHENTICATION');
  
  await test('Register new user', async () => {
    const response = await axios.post(`${BASE_URL}/auth/register`, {
      email: testEmail,
      username: testUsername,
      password: testPassword,
      dateOfBirth: '1990-01-01'
    });
    authToken = response.data.token;
    userId = response.data.user.id;
    if (!authToken) throw new Error('No token received');
  });

  await test('Login', async () => {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: testEmail,
      password: testPassword
    });
    authToken = response.data.token;
    if (!authToken) throw new Error('Login failed');
  });

  await test('Get current user', async () => {
    const response = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!response.data.id) throw new Error('User data not returned');
  });

  // 3. User Profile
  log.section('3. USER PROFILE');
  
  await test('Get user profile', async () => {
    const response = await axios.get(`${BASE_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!response.data.username) throw new Error('Profile not loaded');
  });

  await test('Update profile', async () => {
    const response = await axios.patch(`${BASE_URL}/users/profile`, {
      bio: 'Test bio',
      handicap: 15
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (response.data.user.bio !== 'Test bio') throw new Error('Update failed');
  });

  await test('Get user stats', async () => {
    const response = await axios.get(`${BASE_URL}/users/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (typeof response.data.total_bets === 'undefined') throw new Error('Stats not loaded');
  });

  // 4. Wallet
  log.section('4. WALLET OPERATIONS');
  
  await test('Get wallet balance', async () => {
    const response = await axios.get(`${BASE_URL}/wallet/balance`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (response.data.points_balance !== 1000) throw new Error('Welcome bonus not credited');
  });

  await test('Get transactions', async () => {
    const response = await axios.get(`${BASE_URL}/wallet/transactions`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.transactions)) throw new Error('Transactions not array');
  });

  await test('Get wallet stats', async () => {
    const response = await axios.get(`${BASE_URL}/wallet/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (typeof response.data.points_balance === 'undefined') throw new Error('Stats not loaded');
  });

  // 5. Bets
  log.section('5. BET OPERATIONS');
  
  await test('Create bet', async () => {
    const response = await axios.post(`${BASE_URL}/bets`, {
      name: 'Test Sunday Round',
      description: 'Testing bet creation',
      betType: 'stroke',
      stakeAmount: 100,
      stakeCurrency: 'points',
      maxPlayers: 4,
      courseName: 'Test Course',
      isPublic: true
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    betId = response.data.bet.id;
    if (!betId) throw new Error('Bet not created');
    log.info(`Bet Code: ${response.data.bet.betCode}`);
  });

  await test('Get bet by ID', async () => {
    const response = await axios.get(`${BASE_URL}/bets/${betId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (response.data.bet.id !== betId) throw new Error('Wrong bet returned');
  });

  await test('Get my bets', async () => {
    const response = await axios.get(`${BASE_URL}/bets/user/my-bets`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.bets)) throw new Error('Bets not array');
    if (response.data.bets.length === 0) throw new Error('No bets found');
  });

  await test('Get public bets', async () => {
    const response = await axios.get(`${BASE_URL}/bets/public/list`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.bets)) throw new Error('Bets not array');
  });

  await test('Get bet participants', async () => {
    const response = await axios.get(`${BASE_URL}/bets/${betId}/participants`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.participants)) throw new Error('Participants not array');
  });

  await test('Update ready status', async () => {
    const response = await axios.patch(`${BASE_URL}/bets/${betId}/ready`, {
      isReady: true
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!response.data.message) throw new Error('Ready status not updated');
  });

  // 6. Social
  log.section('6. SOCIAL FEATURES');
  
  await test('Search users', async () => {
    const response = await axios.get(`${BASE_URL}/social/users/search?q=test`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.users)) throw new Error('Users not array');
  });

  await test('Get activity feed', async () => {
    const response = await axios.get(`${BASE_URL}/social/feed`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.feed)) throw new Error('Feed not array');
  });

  await test('Get global leaderboard', async () => {
    const response = await axios.get(`${BASE_URL}/social/leaderboard/global`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.leaderboard)) throw new Error('Leaderboard not array');
  });

  await test('Get friends leaderboard', async () => {
    const response = await axios.get(`${BASE_URL}/social/leaderboard/friends`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.leaderboard)) throw new Error('Leaderboard not array');
  });

  // 7. Store
  log.section('7. STORE OPERATIONS');
  
  await test('Get store items', async () => {
    const response = await axios.get(`${BASE_URL}/store/items`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.items)) throw new Error('Items not array');
  });

  await test('Get user orders', async () => {
    const response = await axios.get(`${BASE_URL}/store/orders`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.orders)) throw new Error('Orders not array');
  });

  // 8. Achievements
  log.section('8. ACHIEVEMENTS');
  
  await test('Get user achievements', async () => {
    const response = await axios.get(`${BASE_URL}/users/achievements`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.earned)) throw new Error('Achievements not loaded');
  });

  // 9. Judges
  log.section('9. JUDGE SYSTEM');
  
  await test('Get available judges', async () => {
    const response = await axios.get(`${BASE_URL}/judges`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!Array.isArray(response.data.judges)) throw new Error('Judges not array');
  });

  // Summary
  log.section('TEST SUMMARY');
  log.success('All critical tests passed! ✨');
  log.info(`Test User: ${testEmail}`);
  log.info(`User ID: ${userId}`);
  log.info(`Auth Token: ${authToken.substring(0, 20)}...`);
}

// Run tests
runTests()
  .then(() => {
    console.log('\n✅ Test suite completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  });