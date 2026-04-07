import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

export const handlers = [
  // Session creation
  http.post(`${BASE}/kiosk/session`, async () => {
    return HttpResponse.json({
      id: 'test-session-id',
      state: 'capture',
      payment_enabled: false,
      payment_status: null,
      captured_at: null,
      capture_image_url: null,
      analysis_text: null,
      analysis_provider: null,
      printed_at: null,
      print_success: null,
      created_at: new Date().toISOString(),
      updated_at: null,
      expires_at: null,
    });
  }),

  // Get session
  http.get(`${BASE}/kiosk/session/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      state: 'processing',
      payment_enabled: false,
      payment_status: null,
      captured_at: new Date().toISOString(),
      capture_image_url: '/captures/test.jpg',
      analysis_text: 'Your vibe is absolutely radiant today!',
      analysis_provider: 'mock',
      printed_at: null,
      print_success: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null,
    });
  }),

  // Capture
  http.post(`${BASE}/kiosk/session/:id/capture`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      state: 'processing',
      payment_enabled: false,
      payment_status: null,
      captured_at: new Date().toISOString(),
      capture_image_url: '/captures/test.jpg',
      analysis_text: null,
      analysis_provider: null,
      printed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null,
    });
  }),

  // Print
  http.post(`${BASE}/kiosk/session/:id/print`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      success: true,
      message: 'Print job sent',
    });
  }),

  // Finish session
  http.post(`${BASE}/kiosk/session/:id/finish`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      state: 'idle',
      message: 'Session completed',
      duration_seconds: 30,
    });
  }),

  // Admin login
  http.post(`${BASE}/admin/login`, async ({ request }) => {
    const body = (await request.json()) as { pin: string };
    if (body.pin === '1234') {
      return HttpResponse.json({
        token: 'test-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
    }
    return HttpResponse.json(
      { error: { code: 'INVALID_PIN', message: 'Invalid PIN', request_id: null } },
      { status: 401 },
    );
  }),

  // Admin config
  http.get(`${BASE}/admin/config`, () => {
    return HttpResponse.json({
      categories: {
        ai: { provider: 'mock', api_key: '', model: '', system_prompt: '' },
        payment: { enabled: false, provider: 'mock', amount: 10000, server_key: '', sandbox: true },
      },
    });
  }),

  http.put(`${BASE}/admin/config/:category`, async ({ params }) => {
    return HttpResponse.json({
      category: params.category,
      updated_fields: {},
      all_values: {},
    });
  }),

  // Hardware status
  http.get(`${BASE}/admin/hardware`, () => {
    return HttpResponse.json({
      camera: {
        connected: true,
        active_device: { index: 0, name: 'Test Camera', path: '/dev/video0' },
        status: { streaming: true, last_capture_at: null, errors: [] },
      },
      printer: {
        connected: true,
        device: { vendor: 'Test', model: 'TP-100', usb_path: '/dev/usb/lp0' },
        status: { paper_ok: true, printer_online: true, last_print_at: null, total_prints_today: 0, errors: [] },
      },
      system: { cpu_usage_percent: 25.5, memory_usage_mb: 512, disk_usage_percent: 45.2, uptime_seconds: 86400 },
    });
  }),

  // Analytics
  http.get(`${BASE}/admin/analytics/sessions`, () => {
    return HttpResponse.json({
      summary: {
        total_sessions: 100,
        completed_sessions: 85,
        abandoned_sessions: 15,
        completion_rate: 0.85,
        avg_duration_seconds: 45,
      },
      state_distribution: { idle: 10, capture: 5, processing: 3, reveal: 2 },
      timeseries: [
        { period: '2025-01-01', sessions: 10, completed: 8, abandoned: 2, avg_duration_seconds: 40 },
      ],
      page: 1,
      per_page: 24,
      total_periods: 1,
    });
  }),

  http.get(`${BASE}/admin/analytics/revenue`, () => {
    return HttpResponse.json({
      summary: {
        total_revenue: 1000000,
        total_transactions: 85,
        avg_transaction_amount: 11764,
        currency: 'IDR',
        refund_count: 0,
        refund_total: 0,
      },
      timeseries: [],
      by_provider: {},
    });
  }),

  // Test camera / printer
  http.post(`${BASE}/admin/hardware/camera/test`, () => {
    return HttpResponse.json({ success: true, message: 'Camera test OK' });
  }),

  http.post(`${BASE}/admin/hardware/printer/test`, () => {
    return HttpResponse.json({ success: true, message: 'Print test OK' });
  }),
];
