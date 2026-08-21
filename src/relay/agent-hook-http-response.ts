import type { ServerResponse } from 'node:http'

export function writeAgentHookJsonResponse(res: ServerResponse, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}
