import assert from "node:assert/strict";
import { list, request, ApiError } from "../src/lib/api.ts";

const responses = [
  { status: 200, body: { data: [{ id: 7 }], meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 } } },
  { status: 200, body: { data: [{ id: 9 }] } },
  { status: 200, body: { data: { user: { id: 4, role: "ADMIN" } } } },
  { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Bad input" } } },
];

globalThis.fetch = async () => {
  const next = responses.shift();
  assert.ok(next, "unexpected fetch");
  return new Response(JSON.stringify(next.body), {
    status: next.status,
    headers: { "content-type": "application/json" },
  });
};

assert.deepEqual(await list("/products?page=2"), {
  data: [{ id: 7 }],
  meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
});
assert.deepEqual((await list("/users/customers")).data, [{ id: 9 }]);
assert.deepEqual(await request("/auth/me"), { user: { id: 4, role: "ADMIN" } });
await assert.rejects(() => request("/invalid"), (error) =>
  error instanceof ApiError && error.status === 400 && error.code === "VALIDATION_ERROR",
);
assert.equal(responses.length, 0);
console.log("API response helper checks passed.");
