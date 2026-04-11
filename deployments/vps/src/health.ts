import { createServer } from 'http'

const startedAt = Date.now()

export function startHealthServer(port = 3001) {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
        worker_type: process.env.WORKER_TYPE || 'cron',
        timestamp: new Date().toISOString(),
      }))
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, () => {
    console.log(`[health] Listening on port ${port}`)
  })
}
