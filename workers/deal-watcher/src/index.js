export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let targetUrl = "";
    const upstreamHeaders = new Headers();
    const authorization = request.headers.get("Authorization");
    if (authorization) upstreamHeaders.set("Authorization", authorization);

    let body;

    if (url.pathname.startsWith("/itad/")) {
      const endpoint = url.pathname.replace("/itad/", "");
      const useApiKey = !authorization;
      const separator = url.search ? "&" : "?";
      const key = useApiKey ? `${separator}key=${env.ITAD_API_KEY}` : "";
      targetUrl = `https://api.isthereanydeal.com/${endpoint}${url.search}${key}`;

      if (request.method !== "GET" && request.method !== "HEAD") {
        const contentType = request.headers.get("Content-Type");
        if (contentType) upstreamHeaders.set("Content-Type", contentType);
        body = await request.arrayBuffer();
      }
    } else if (url.pathname.startsWith("/auth/")) {
      const endpoint = url.pathname.replace("/auth/", "");
      targetUrl = `https://isthereanydeal.com/${endpoint}${url.search}`;

      if (endpoint.includes("oauth/token") && request.method === "POST") {
        const form = new URLSearchParams(await request.text());
        form.set("client_secret", env.ITAD_CLIENT_SECRET || "");
        upstreamHeaders.set("Content-Type", "application/x-www-form-urlencoded");
        body = form.toString();
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        const contentType = request.headers.get("Content-Type");
        if (contentType) upstreamHeaders.set("Content-Type", contentType);
        body = await request.arrayBuffer();
      }
    } else {
      return new Response("Endpoint não encontrado", { status: 404, headers: corsHeaders });
    }

    try {
      const apiResponse = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body,
      });
      const data = await apiResponse.text();

      return new Response(data, {
        status: apiResponse.status,
        headers: {
          ...corsHeaders,
          "Content-Type": apiResponse.headers.get("Content-Type") || "application/json",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
