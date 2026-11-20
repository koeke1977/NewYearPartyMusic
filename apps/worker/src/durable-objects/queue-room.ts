export class QueueRoom {
  constructor(_state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "queue-room" });
    }

    return new Response("Not found", { status: 404 });
  }
}
