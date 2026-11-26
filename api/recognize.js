const { recognitionInstructions } = require("../lib/sticker-policy.cjs");
const dietFocuses = {
  basic: { fields: [], instructions: "" },
  sugar: {
    fields: ["totalSugar", "addedSugar"],
    instructions: `额外返回整餐总糖 totalSugar 与添加糖 addedSugar，单位克，两者都是整餐合计，不要每100克填写。总糖含天然存在的糖和添加糖，是总碳水的一部分。添加糖是加入食物或饮料的糖及含糖甜味配料，是总糖的一部分。
优先使用清楚可读的标签，并按可辨认的实际份量换算。只在食物和份量有合理依据时估算总糖。不要把碳水直接当总糖，也不要凭外观猜饮料甜度或酱汁糖量。添加糖只在有明确可核对的依据时填写。任何一部分可能显著影响整餐合计且无法判断时，对应字段填 null。只有有依据时才填 0。`
  },
  antiInflammatory: {
    fields: ["fiber"],
    instructions: `额外返回整餐膳食纤维 fiber，单位克。根据可辨认的食材、份量或可读营养标签估算。整餐纤维量缺乏合理依据时填 null。只有有依据时才填 0。不要推断炎症状态，也不要提供抗炎评分。`
  }
};
const refinedCarbInstructions = "\n\nfoods 每项填写 refinedCarb：这一份的主体是精制碳水时为 true，例如白米饭、白粥、白面条、米粉、白面包、白馒头、包子皮为主的面点、饼干蛋糕甜点、含糖饮料和果汁。全谷物、杂粮、薯类、蔬菜、肉蛋奶、水果为主时为 false。混合的一份按主体判断，比如牛肉面为 true，沙拉为 false。";
const optionalGrams = { type: ["number", "null"], minimum: 0, maximum: 10000 };
const gramFields = (keys) => Object.fromEntries(keys.map(key => [key, optionalGrams]));
const validAmount = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 10000);
const macroKeys = ["carb", "pro", "fat"];
const regionSchema={type:"object",additionalProperties:false,required:["x","y","width","height"],properties:Object.fromEntries(["x","y","width","height"].map(key=>[key,{type:"number",minimum:0,maximum:1000}]))};
const validRegion=b=>b&&["x","y","width","height"].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1000.01&&b.y+b.height<=1000.01;
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["foodVisible", "name", "portion", "kcal", "carb", "pro", "fat", "notes", "singleMixedDishBox", "foods"],
  properties: {
    foodVisible: { type: "boolean" },
    name: { type: "string" },
    portion: optionalGrams,
    kcal: optionalGrams,
    carb: optionalGrams,
    pro: optionalGrams,
    fat: optionalGrams,
    notes: { type: "string" },
    singleMixedDishBox: { ...regionSchema, type: ["object", "null"] },
    foods: { type: "array", maxItems: 16, items: {
      type: "object", additionalProperties: false, required: ["name", "kcal", "refinedCarb", "box", "contour", "regions"],
      properties: {
        name: { type: "string" }, kcal: optionalGrams, refinedCarb: { type: "boolean" },
        box: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"],
          properties: Object.fromEntries(["x", "y", "width", "height"].map(key => [key, { type: "number", minimum: 0, maximum: 1000 }])) },
        regions:{type:"array",minItems:1,maxItems:8,items:regionSchema},
        contour: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["x", "y"],
          properties: { x: { type: "number", minimum: 0, maximum: 1000 }, y: { type: "number", minimum: 0, maximum: 1000 } } } }
      }
    } }

  }
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "请使用拍照识别入口。" });
  const origin = req.headers.origin;
  if (origin && origin !== "https://" + req.headers.host && origin !== "http://" + req.headers.host) {
    return res.status(403).json({ error: "请从好好吃饭打开识别。" });
  }
  const photo = req.body?.photo;
  if (typeof photo !== "string" || photo.length > 1500000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)) {
    return res.status(400).json({ error: "请上传一张有效的餐食照片。" });
  }
  const focusId = req.body?.dietFocus ?? "basic";
  if (typeof focusId !== "string" || !Object.hasOwn(dietFocuses, focusId)) {
    return res.status(400).json({ error: "请选择有效的饮食关注项。" });
  }
  const focus = dietFocuses[focusId];
  const foodKeys = [...macroKeys, ...focus.fields];
  const foodItems = schema.properties.foods.items;
  const focusedSchema = {
    ...schema,
    required: [...schema.required, ...focus.fields],
    properties: {
      ...schema.properties,
      ...gramFields(focus.fields),
      foods: {
        ...schema.properties.foods,
        items: {
          ...foodItems,
          required: [...foodItems.required, "nutrients"],
          properties: {
            ...foodItems.properties,
            nutrients: { type: "object", additionalProperties: false, required: foodKeys, properties: gramFields(foodKeys) }
          }
        }
      }
    }
  };
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "识别服务尚未配置，可以先手动记录。" });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: "gpt-5.4",
        reasoning: { effort: "low" },
        store: false,
        max_output_tokens: 6500,
        instructions: focus.instructions ? recognitionInstructions + "\n\n" + focus.instructions +
          "\nfoods 每项的 nutrients 也填写这些额外指标，只计算该餐品，使用相同的证据标准。foodVisible=false 时整餐额外营养字段填 null。" + refinedCarbInstructions : recognitionInstructions + refinedCarbInstructions,
        input: [{ role: "user", content: [
          { type: "input_text", text: "请识别这餐并估算份量和营养，供我修改后保存。" },
          { type: "input_image", image_url: photo, detail: "high" }
        ] }],
        text: { format: { type: "json_schema", name: "meal", strict: true, schema: focusedSchema } }
      })
    });
    if (!response.ok) {
      const status = response.status;
      const failure = await response.json().catch(() => ({}));
      const upstreamCode = failure.error?.code || failure.error?.type;
      const code = typeof upstreamCode === "string" && /^[a-z_]{1,64}$/.test(upstreamCode) ? upstreamCode : "upstream_error";
      if (["insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached"].includes(code)) {
        return res.status(503).json({ error: "OpenAI API 账户额度不足，请在 API 平台补充额度后重试。可以先手动记录。" });
      }
      return res.status(status === 429 ? 429 : 502).json({ code, error: status === 429
        ? "识别额度不足或请求繁忙，请稍后重试，也可以先手动记录。"
        : status === 401 ? "识别服务的密钥无效，请更新服务端配置。"
        : "识别服务暂时不可用，请稍后重试。" });
    }
    const data = await response.json();
    const output = data.output?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
    if (data.status !== "completed" || !output) throw new Error("Incomplete response");
    const meal = JSON.parse(output);
    if (typeof meal.foodVisible !== "boolean" || typeof meal.name !== "string" ||
        typeof meal.notes !== "string" ||
        !["portion", "kcal", "carb", "pro", "fat"].every((key) =>
          validAmount(meal[key]))) {
      throw new Error("Invalid estimate");
    }
    if (!Array.isArray(meal.foods) || meal.foods.length > 16 || meal.foods.some(food =>
      !food || typeof food.name !== "string" || !food.name.trim() || !validAmount(food.kcal) ||
      !food.box || !["x", "y", "width", "height"].every(key => Number.isFinite(food.box[key])) ||
      food.box.x < 0 || food.box.y < 0 || food.box.width <= 0 || food.box.height <= 0 ||
      food.box.x + food.box.width > 1000.01 || food.box.y + food.box.height > 1000.01 ||
      !Array.isArray(food.contour) || food.contour.length > 24 ||
      food.contour.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > 1000 || point.y > 1000)
    ) || (meal.foodVisible && !meal.foods.length) || (!meal.foodVisible && meal.foods.length)) throw new Error("Invalid food items");
    if(meal.foods.some(food=>food.regions!==undefined&&(!Array.isArray(food.regions)||!food.regions.length||food.regions.length>8||food.regions.some(b=>!validRegion(b)))))throw new Error("Invalid serving regions");
    meal.foods = meal.foods.map(food => {
      const nutrients = Object.fromEntries(foodKeys.map(key => {
        const value = food.nutrients?.[key];
        return [key, Number.isFinite(value) && value >= 0 && value <= 10000 ? value : null];
      }));
      if (nutrients.carb !== null) {
        for (const key of ["totalSugar", "addedSugar"]) {
          if (nutrients[key] > nutrients.carb) nutrients[key] = null;
        }
      }
      if (typeof nutrients.totalSugar === "number" && nutrients.addedSugar > nutrients.totalSugar) nutrients.addedSugar = null;
      return { ...food, nutrients, refinedCarb: food.refinedCarb === true, regions:food.regions||[food.box], name: food.name.trim().slice(0, 60) };
    });
    for (const key of focus.fields) {
      const value = meal[key];
      const maximum = key === "fiber" ? 10000 : (meal.carb ?? 10000);
      meal[key] = meal.foodVisible && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
    }
    if (typeof meal.totalSugar === "number" && meal.addedSugar > meal.totalSugar) meal.addedSugar = null;
    if (meal.foodVisible && meal.foods.length > 1 && validRegion(meal.singleMixedDishBox) && meal.name.trim()) {
      const box = meal.singleMixedDishBox;
      const centersInside = meal.foods.every(({box: part}) => {
        const x = part.x + part.width / 2, y = part.y + part.height / 2;
        return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
      });
      if (centersInside) {
        // The model identified a single mixed serving but returned ingredient rows.
        // Use the whole meal estimate to avoid counting a dish and its ingredients twice.
        meal.foods = [{ name: meal.name.trim().slice(0, 60), kcal: meal.kcal, box, regions: [box], contour: [],
          refinedCarb: meal.foods.some(food => food.refinedCarb),
          nutrients: Object.fromEntries(foodKeys.map(key => [key, validAmount(meal[key]) ? meal[key] : null])) }];
      }
    }
    delete meal.singleMixedDishBox;
    if (meal.foods.length && meal.foods.every(food => food.kcal !== null)) {
      meal.kcal = Math.round(meal.foods.reduce((sum, food) => sum + food.kcal, 0));
    }
    if (meal.kcal > 10000) throw new Error("Invalid calorie total");
    meal.name = meal.name.slice(0, 60);
    meal.notes = meal.notes.slice(0, 500);
    return res.status(200).json(meal);
  } catch {
    return res.status(502).json({ error: "这次没能识别完成，请重试或手动填写。" });
  }
};
