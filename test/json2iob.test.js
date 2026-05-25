const { expect } = require("@jest/globals");
const Json2iob = require("../dist/index");
const fs = require("fs");
const path = require("path");
function loadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading the JSON file:", error);
    return null;
  }
}

const mockIoBroker = {
  states: {},
  objects: {},
  log: {
    error: (message) => console.error("ERROR:", message),
    info: (message) => console.log("INFO:", message),
    debug: (message) => console.debug("DEBUG:", message),
  },
  setStateAsync: async function (key, value) {
    this.states[key] = value;
    return Promise.resolve();
  },
  extendObjectAsync: async function (id, obj) {
    this.objects[id] = { ...obj, id };
    return Promise.resolve();
  },
};

function formatTree(data, prefix = "") {
  let output = "";
  for (const [key, value] of Object.entries(data)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      output += `${fullPath}:\n`;
      output += formatTree(value, fullPath);
    } else {
      output += `${fullPath}: ${value}\n`;
    }
  }
  return output;
}

function createMockAdapter() {
  return {
    states: {},
    objects: {},
    setStateCallCount: 0,
    log: {
      error: (message) => console.error("ERROR:", message),
      info: (message) => console.log("INFO:", message),
      debug: (message) => console.debug("DEBUG:", message),
      warn: (message) => console.warn("WARN:", message),
    },
    setStateAsync: async function (key, value) {
      this.states[key] = value;
      this.setStateCallCount++;
      return Promise.resolve();
    },
    extendObjectAsync: async function (id, obj) {
      this.objects[id] = { ...obj, id };
      return Promise.resolve();
    },
  };
}

// Jest test case
describe("Json2iob", () => {
  test("should correctly parse JSON", async () => {
    const sampleJsonPath = path.join(__dirname, "sample.json");

    // Ensure the JSON data is loaded correctly
    const sampleJson = loadJSON(sampleJsonPath);
    expect(sampleJson).not.toBeNull();

    // Create an instance of Json2iob
    const adapter = new Json2iob(mockIoBroker);

    // Parse the JSON data
    await adapter.parse("test", sampleJson, { write: true });

    // Generate tree-like structure for states
    console.log("Final states in tree format:");
    console.log(formatTree(mockIoBroker.states));

    // Use Jest snapshot to capture the current state of mockIoBroker.objects and mockIoBroker.states
    expect(mockIoBroker.objects).toMatchSnapshot();
    expect(mockIoBroker.states).toMatchSnapshot();
  });

  describe("previousData option", () => {
    test("should set all states when previousData is not provided", async () => {
      const mock = createMockAdapter();
      const adapter = new Json2iob(mock);
      const data = { temperature: 25, humidity: 60, name: "sensor1" };

      await adapter.parse("test", data, { write: true });

      expect(mock.setStateCallCount).toBe(3);
      expect(mock.states["test.temperature"]).toBe(25);
      expect(mock.states["test.humidity"]).toBe(60);
      expect(mock.states["test.name"]).toBe("sensor1");
    });

    test("should not set states when previousData has same values", async () => {
      const mock = createMockAdapter();
      const adapter = new Json2iob(mock);
      const data = { temperature: 25, humidity: 60, name: "sensor1" };

      await adapter.parse("test", data, { write: true, previousData: data });

      expect(mock.setStateCallCount).toBe(0);
      expect(mock.states).toEqual({});
    });

    test("should only set changed states when previousData differs", async () => {
      const mock = createMockAdapter();
      const adapter = new Json2iob(mock);
      const previousData = { temperature: 25, humidity: 60, name: "sensor1" };
      const newData = { temperature: 26, humidity: 60, name: "sensor1" };

      await adapter.parse("test", newData, { write: true, previousData: previousData });

      expect(mock.setStateCallCount).toBe(1);
      expect(mock.states["test.temperature"]).toBe(26);
      expect(mock.states["test.humidity"]).toBeUndefined();
      expect(mock.states["test.name"]).toBeUndefined();
    });

    test("should handle nested objects with previousData", async () => {
      const mock = createMockAdapter();
      const adapter = new Json2iob(mock);
      const previousData = {
        sensor: { temperature: 25, humidity: 60 },
        status: "online",
      };
      const newData = {
        sensor: { temperature: 25, humidity: 65 },
        status: "online",
      };

      await adapter.parse("test", newData, { write: true, previousData: previousData });

      expect(mock.setStateCallCount).toBe(1);
      expect(mock.states["test.sensor.humidity"]).toBe(65);
      expect(mock.states["test.sensor.temperature"]).toBeUndefined();
      expect(mock.states["test.status"]).toBeUndefined();
    });

    test("should set state when key is new in data", async () => {
      const mock = createMockAdapter();
      const adapter = new Json2iob(mock);
      const previousData = { temperature: 25 };
      const newData = { temperature: 25, humidity: 60 };

      await adapter.parse("test", newData, { write: true, previousData: previousData });

      expect(mock.setStateCallCount).toBe(1);
      expect(mock.states["test.humidity"]).toBe(60);
      expect(mock.states["test.temperature"]).toBeUndefined();
    });

    test("should handle boolean value changes", async () => {
      const mock = createMockAdapter();
      const adapter = new Json2iob(mock);
      const previousData = { active: true, enabled: false };
      const newData = { active: false, enabled: false };

      await adapter.parse("test", newData, { write: true, previousData: previousData });

      expect(mock.setStateCallCount).toBe(1);
      expect(mock.states["test.active"]).toBe(false);
      expect(mock.states["test.enabled"]).toBeUndefined();
    });
  });
});
