import { sleep } from "k6";
import http from "k6/http";

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 500 },
    { duration: "30s", target: 0 },
  ],
};

export default function () {
  // Mock testing the SSE stream
  const res = http.get("http://localhost:3000/api/plan/stream?tripId=load-test");
  // ensure SSE headers or 200 OK
  if (res.status !== 200) {
    console.error(`Failed with status ${res.status}`);
  }
  sleep(1);
}
