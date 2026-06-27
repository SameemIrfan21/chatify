import arcjet, { shield, slidingWindow } from "@arcjet/node";

import { ENV } from "./env.js";

const arcjetMode = ENV.ARCJET_ENV === "production" ? "LIVE" : "DRY_RUN";

const aj = ENV.ARCJET_KEY
  ? arcjet({
      key: ENV.ARCJET_KEY,
      rules: [
        // Shield protects your app from common attacks e.g. SQL injection
        shield({ mode: arcjetMode }),
        // Create a token bucket rate limit. Other algorithms are supported.
        slidingWindow({
          mode: arcjetMode,
          max: 100,
          interval: 60,
        }),
      ],
    })
  : null;

export default aj;