import express from 'express';
import basicAuth from 'express-basic-auth';
import redisStreamService from '../services/redisStreamService.js';
import { jobMetrics } from '../monitoring/metrics.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Basic auth middleware
const auth = basicAuth({
  users: { 'admin': process.env.DASHBOARD_PASSWORD || 'admin' },
  challenge: true,
  realm: 'Bank Statement Analyzer Dashboard'
});

// Get queue stats
const getQueueStats = async () => {
  try {
    const streamInfo = await redisStreamService.getStreamInfo(
      redisStreamService.streams.STATEMENT_UPLOAD
    );
    
    const pendingJobs = await redisStreamService.getPendingJobs();
    const failedJobs = await redisStreamService.getFailedJobs();
    const processingJobs = await redisStreamService.getProcessingJobs();
    
    return {
      totalJobs: streamInfo?.length || 0,
      pendingJobs: pendingJobs.length,
      failedJobs: failedJobs.length,
      processingJobs: processingJobs.length,
      avgProcessingTime: await jobMetrics.processingDuration.get()
    };
  } catch (error) {
    logger.error('Error getting queue stats', { error: error.message });
    throw error;
  }
};

// API Routes
router.get('/api/stats', auth, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching queue statistics' });
  }
});

router.get('/api/jobs/failed', auth, async (req, res) => {
  try {
    const failedJobs = await redisStreamService.getFailedJobs();
    res.json(failedJobs);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching failed jobs' });
  }
});

router.post('/api/jobs/:jobId/retry', auth, async (req, res) => {
  try {
    const { jobId } = req.params;
    await redisStreamService.retryJob(jobId);
    res.json({ message: 'Job queued for retry' });
  } catch (error) {
    res.status(500).json({ error: 'Error retrying job' });
  }
});

// Dashboard HTML
router.get('/', auth, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Job Queue Dashboard</title>
          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body class="bg-gray-100">
          <div class="container mx-auto px-4 py-8">
            <h1 class="text-3xl font-bold mb-8">Job Queue Dashboard</h1>
            
            <!-- Stats Grid -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-gray-500 text-sm font-medium">Total Jobs</h3>
                <p class="text-3xl font-bold">${stats.totalJobs}</p>
              </div>
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-gray-500 text-sm font-medium">Pending Jobs</h3>
                <p class="text-3xl font-bold">${stats.pendingJobs}</p>
              </div>
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-gray-500 text-sm font-medium">Processing Jobs</h3>
                <p class="text-3xl font-bold">${stats.processingJobs}</p>
              </div>
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-gray-500 text-sm font-medium">Failed Jobs</h3>
                <p class="text-3xl font-bold">${stats.failedJobs}</p>
              </div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-lg font-medium mb-4">Processing Time Distribution</h3>
                <canvas id="processingTimeChart"></canvas>
              </div>
              <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-lg font-medium mb-4">Job Status Distribution</h3>
                <canvas id="statusChart"></canvas>
              </div>
            </div>

            <!-- Failed Jobs Table -->
            <div class="bg-white rounded-lg shadow overflow-hidden">
              <div class="px-6 py-4 border-b border-gray-200">
                <h3 class="text-lg font-medium">Failed Jobs</h3>
              </div>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job ID</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Failed At</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200" id="failedJobsTable">
                    <!-- Failed jobs will be inserted here via JavaScript -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <script>
            // Fetch and update failed jobs table
            async function updateFailedJobs() {
              const response = await fetch('/dashboard/api/jobs/failed');
              const jobs = await response.json();
              
              const tbody = document.getElementById('failedJobsTable');
              tbody.innerHTML = jobs.map(job => \`
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap">\${job.id}</td>
                  <td class="px-6 py-4">\${job.error}</td>
                  <td class="px-6 py-4 whitespace-nowrap">\${new Date(job.failedAt).toLocaleString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <button
                      onclick="retryJob('\${job.id}')"
                      class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              \`).join('');
            }

            // Retry a failed job
            async function retryJob(jobId) {
              try {
                await fetch(\`/dashboard/api/jobs/\${jobId}/retry\`, { method: 'POST' });
                updateFailedJobs();
              } catch (error) {
                console.error('Error retrying job:', error);
              }
            }

            // Initialize and update the dashboard
            async function updateDashboard() {
              const response = await fetch('/dashboard/api/stats');
              const stats = await response.json();

              // Update processing time chart
              new Chart(document.getElementById('processingTimeChart'), {
                type: 'line',
                data: {
                  labels: Array.from({length: 24}, (_, i) => \`\${i}h ago\`),
                  datasets: [{
                    label: 'Avg Processing Time (s)',
                    data: stats.avgProcessingTime || [],
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                  }]
                }
              });

              // Update status distribution chart
              new Chart(document.getElementById('statusChart'), {
                type: 'doughnut',
                data: {
                  labels: ['Pending', 'Processing', 'Failed', 'Completed'],
                  datasets: [{
                    data: [
                      stats.pendingJobs,
                      stats.processingJobs,
                      stats.failedJobs,
                      stats.totalJobs - (stats.pendingJobs + stats.processingJobs + stats.failedJobs)
                    ],
                    backgroundColor: [
                      'rgb(255, 205, 86)',
                      'rgb(54, 162, 235)',
                      'rgb(255, 99, 132)',
                      'rgb(75, 192, 192)'
                    ]
                  }]
                }
              });
            }

            // Initial load
            updateDashboard();
            updateFailedJobs();

            // Refresh every 30 seconds
            setInterval(() => {
              updateDashboard();
              updateFailedJobs();
            }, 30000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error loading dashboard');
  }
});

export default router;
