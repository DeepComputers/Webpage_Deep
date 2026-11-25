import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics to track specific parts of the system
const errorRate = new Rate('custom_error_rate');
const pageLoadTime = new Trend('page_load_duration');
const apiLoadTime = new Trend('api_load_duration');

// Configurable target URL: defaults to local server, can be overridden via TARGET_URL env var
const BASE_URL = (__ENV.TARGET_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

// Realistic search terms and categories users browse
const SEARCH_KEYWORDS = ['laptop', 'charger', 'cctv', 'mouse', 'cable', 'printer', 'speaker', 'hp', 'sandisk', 'adapter'];
const CATEGORIES = ['laptops', 'accessories', 'adapters', 'storage', 'cctv', 'speakers'];

// Dynamically configure load stages & thresholds based on profile
function getTestOptions() {
  const profile = (__ENV.PROFILE || '').toLowerCase();

  const baseConfig = {
    batch: 4,
    batchPerHost: 4,
    // ZERO DOWNLOAD: Discard response bodies completely so VUs do not consume internet bandwidth
    discardResponseBodies: true,
  };

  if (profile === 'tunnel' || profile === 'worker') {
    return {
      ...baseConfig,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '20s', target: 150 },
        { duration: '20s', target: 250 },
        { duration: '10s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.02'],
        custom_error_rate: ['rate<0.02'],
      },
    };
  }

  if (profile === '1500') {
    return {
      ...baseConfig,
      stages: [
        { duration: '10s', target: 1500 },
        { duration: '40s', target: 1500 },
        { duration: '10s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<3000'],
        http_req_failed: ['rate<0.05'],
        custom_error_rate: ['rate<0.05'],
      },
    };
  }

  if (profile === '1000') {
    return {
      ...baseConfig,
      stages: [
        { duration: '8s', target: 1000 },
        { duration: '44s', target: 1000 },
        { duration: '8s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<2500'],
        http_req_failed: ['rate<0.05'],
        custom_error_rate: ['rate<0.05'],
      },
    };
  }

  if (profile === '500') {
    return {
      ...baseConfig,
      stages: [
        { duration: '5s', target: 500 },
        { duration: '50s', target: 500 },
        { duration: '5s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.03'],
        custom_error_rate: ['rate<0.03'],
      },
    };
  }

  if (profile === '250') {
    return {
      ...baseConfig,
      stages: [
        { duration: '5s', target: 100 },
        { duration: '20s', target: 250 },
        { duration: '30s', target: 250 },
        { duration: '5s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<1500'],
        http_req_failed: ['rate<0.02'],
        custom_error_rate: ['rate<0.02'],
      },
    };
  }

  if (profile === '150') {
    return {
      ...baseConfig,
      stages: [
        { duration: '5s', target: 50 },
        { duration: '10s', target: 150 },
        { duration: '15s', target: 150 },
        { duration: '5s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<1500'],
        http_req_failed: ['rate<0.02'],
        custom_error_rate: ['rate<0.02'],
      },
    };
  }

  if (profile === '50') {
    return {
      ...baseConfig,
      stages: [
        { duration: '5s', target: 20 },
        { duration: '10s', target: 50 },
        { duration: '15s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.02'],
        custom_error_rate: ['rate<0.02'],
      },
    };
  }

  // Default profile
  return {
    ...baseConfig,
    stages: [
      { duration: '5s', target: 10 },
      { duration: '10s', target: 10 },
      { duration: '5s', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<1000'],
      http_req_failed: ['rate<0.02'],
      custom_error_rate: ['rate<0.02'],
    },
  };
}

export const options = getTestOptions();

// Lightweight headers: No content download, zero bandwidth waste
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'ngrok-skip-browser-warning': 'true',
};

export default function () {
  const keyword = SEARCH_KEYWORDS[Math.floor(Math.random() * SEARCH_KEYWORDS.length)];
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

  // -------------------------------------------------------------
  // STEP 1: Homepage & Core Assets (HEAD request = 0 bytes download)
  // -------------------------------------------------------------
  group('1. Homepage & Core Assets', function () {
    const homeRes = http.head(`${BASE_URL}/`, { headers: HEADERS });
    pageLoadTime.add(homeRes.timings.duration);

    const homeOk = check(homeRes, {
      'homepage status is 200': (r) => r.status === 200,
    });
    errorRate.add(!homeOk);

    // Parallel static asset check (HEAD = 0 bytes downloaded)
    const assets = [
      `${BASE_URL}/assets/styles.css`,
      `${BASE_URL}/assets/site.js`,
    ];
    const assetResponses = http.batch(assets.map(url => ['HEAD', url, null, { headers: HEADERS }]));
    assetResponses.forEach(res => {
      check(res, { 'static code asset 200': (r) => r.status === 200 });
    });
  });

  sleep(Math.random() * 0.5 + 0.5);

  // -------------------------------------------------------------
  // STEP 2: Products API, Brands, and Certificates (HEAD = 0 bytes download)
  // -------------------------------------------------------------
  group('2. Load Products API', function () {
    const apiRes = http.head(`${BASE_URL}/api/products`, { headers: HEADERS });
    apiLoadTime.add(apiRes.timings.duration);

    const apiOk = check(apiRes, {
      'products API status is 200': (r) => r.status === 200,
    });
    errorRate.add(!apiOk);

    // Metadata in parallel (HEAD = 0 bytes downloaded)
    const metaResponses = http.batch([
      ['HEAD', `${BASE_URL}/api/brands`, null, { headers: HEADERS }],
      ['HEAD', `${BASE_URL}/api/certificates`, null, { headers: HEADERS }],
    ]);
    metaResponses.forEach(res => {
      check(res, { 'meta API 200': (r) => r.status === 200 });
    });
  });

  sleep(Math.random() * 0.5 + 0.5);

  // -------------------------------------------------------------
  // STEP 3: Search & Category Filter (HEAD = 0 bytes download)
  // -------------------------------------------------------------
  group('3. Search & Filter Products', function () {
    const searchRes = http.head(`${BASE_URL}/api/products?search=${encodeURIComponent(keyword)}`, { headers: HEADERS });
    apiLoadTime.add(searchRes.timings.duration);
    check(searchRes, { 'search API 200': (r) => r.status === 200 });

    const catRes = http.head(`${BASE_URL}/api/products?category=${encodeURIComponent(category)}`, { headers: HEADERS });
    apiLoadTime.add(catRes.timings.duration);
    check(catRes, { 'category API 200': (r) => r.status === 200 });
  });

  // -------------------------------------------------------------
  // STEP 4: Catalog, Services, and On-Order Pages (HEAD = 0 bytes download)
  // -------------------------------------------------------------
  group('4. Catalog & Custom Order Pages', function () {
    const pages = [
      `${BASE_URL}/catalog`,
      `${BASE_URL}/services`,
      `${BASE_URL}/onorder`,
    ];
    const pageResponses = http.batch(pages.map(url => ['HEAD', url, null, { headers: HEADERS }]));
    pageResponses.forEach(res => {
      pageLoadTime.add(res.timings.duration);
      check(res, { 'page status 200': (r) => r.status === 200 });
    });

    const onorderApiRes = http.head(`${BASE_URL}/api/onorder/products`, { headers: HEADERS });
    apiLoadTime.add(onorderApiRes.timings.duration);
    check(onorderApiRes, {
      'onorder API status 200': (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 0.5 + 0.5);
}
