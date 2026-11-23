const assert = require("node:assert/strict");
const { test } = require("node:test");
const recognize = require("../api/recognize.js");

const photo = "data:image/jpeg;base64,AAAA";
const meal = {
  foodVisible: true, name: "燕麦和牛奶", portion: 240, kcal: 245, carb: 38, pro: 12, fat: 5, notes: "",
  foods: [{ name: "燕麦和牛奶", kcal: 245, box: { x: 100, y: 100, width: 500, height: 400 }, contour: [] }]
};

async function request(dietFocus, upstreamMeal) {
  let modelRequest;
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  global.fetch = async (_url, options) => {
    modelRequest = JSON.parse(options.body);
    return { ok: true, json: async () => ({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(upstreamMeal) }] }]
    }) };
  };
  const response = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  try {
    await recognize({ method: "POST", headers: { host: "localhost" }, body: { photo, dietFocus } }, response);
    return { ...response, modelRequest };
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
}

test("basic recognition adds dish macros without requiring focus nutrients", async () => {
  const result = await request(undefined, meal);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.kcal, 245);
  const { properties } = result.modelRequest.text.format.schema;
  assert.equal(properties.totalSugar, undefined);
  assert.equal(properties.fiber, undefined);
  assert.deepEqual(properties.foods.items.properties.nutrients.required, ["carb", "pro", "fat"]);
  assert.deepEqual(result.body.foods[0].nutrients, { carb: null, pro: null, fat: null });
});

test("sugar focus returns nullable whole-meal sugar estimates", async () => {
  const foods = [{ ...meal.foods[0], nutrients: { carb: 38, pro: 12, fat: 5, totalSugar: 6.1, addedSugar: 0 } }];
  const result = await request("sugar", { ...meal, foods, totalSugar: 9.4, addedSugar: null });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.totalSugar, 9.4);
  assert.equal(result.body.addedSugar, null);
  const schema = result.modelRequest.text.format.schema;
  assert.deepEqual(schema.required.slice(-2), ["totalSugar", "addedSugar"]);
  assert.deepEqual(schema.properties.addedSugar.type, ["number", "null"]);
  assert.equal(schema.properties.fiber, undefined);
  assert.deepEqual(schema.properties.foods.items.properties.nutrients.required.slice(-2), ["totalSugar", "addedSugar"]);
  assert.deepEqual(result.body.foods[0].nutrients, foods[0].nutrients);
  assert.match(result.modelRequest.instructions, /不要把碳水直接当总糖/);

  const inconsistent = await request("sugar", { ...meal, totalSugar: 5, addedSugar: 10 });
  assert.equal(inconsistent.statusCode, 200);
  assert.equal(inconsistent.body.totalSugar, 5);
  assert.equal(inconsistent.body.addedSugar, null);
});

test("anti-inflammatory focus requests fiber and preserves a known zero", async () => {
  const result = await request("antiInflammatory", { ...meal, fiber: 0 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.fiber, 0);
  const schema = result.modelRequest.text.format.schema;
  assert.equal(schema.required.at(-1), "fiber");
  assert.equal(schema.properties.totalSugar, undefined);
  assert.equal(schema.properties.foods.items.properties.nutrients.required.at(-1), "fiber");
  assert.match(result.modelRequest.instructions, /不要推断炎症状态/);
  const invalid = await request("antiInflammatory", { ...meal, fiber: -1 });
  assert.equal(invalid.statusCode, 200);
  assert.equal(invalid.body.fiber, null);
});

test("invalid focus values are rejected before requesting recognition", async () => {
  const result = await request("constructor", meal);
  assert.equal(result.statusCode, 400);
  assert.equal(result.modelRequest, undefined);
});
