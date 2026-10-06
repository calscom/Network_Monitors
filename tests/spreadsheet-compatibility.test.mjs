import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const excelRequire = createRequire(require.resolve("exceljs"));
const implementations = [
  ["CommonJS", require("exceljs")],
  // Exercise the distribution Vite resolves for the frontend, too.
  // This runs under Node, not a browser or an authenticated UI.
  ["browser distribution", require("exceljs/dist/exceljs.min.js")],
];

function asArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test("ExcelJS can load uuid through CommonJS and generate valid IDs", () => {
  const uuid = excelRequire("uuid");
  assert.equal(uuid.validate(uuid.v4()), true);
  assert.throws(() => uuid.v5("test", uuid.v5.DNS, Buffer.alloc(1)), RangeError);
});

for (const [name, ExcelJS] of implementations) {
  test(`${name}: site workbook export/import preserves the UI's row parsing`, async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sites");
    sheet.addRows([["North", "South"], ["North"], ["São Paulo"], [42]]);
    const bytes = await workbook.xlsx.writeBuffer();
    const imported = new ExcelJS.Workbook();
    await imported.xlsx.load(asArrayBuffer(bytes));
    const data = [];
    imported.worksheets[0].eachRow(row => data.push(row.values.slice(1)));
    const sites = [...new Set(data.flat().filter(s => typeof s === "string" && s.trim()))];
    assert.deepEqual(sites, ["North", "South", "São Paulo"]);
  });

  test(`${name}: device workbook export/import preserves headers and values`, async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Devices");
    sheet.addRows([
      ["name", "ip", "site", "poll_type", "max_bandwidth"],
      ["Router A", "192.0.2.1", "North", "snmp_only", 100],
      ["Router B", "192.0.2.2", "South", "ping_only", 1000],
    ]);
    sheet.getRow(1).font = { bold: true };
    const imported = new ExcelJS.Workbook();
    await imported.xlsx.load(asArrayBuffer(await workbook.xlsx.writeBuffer()));
    const headers = [];
    const devices = [];
    imported.worksheets[0].eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.values.slice(1).forEach(h => headers.push(String(h ?? "")));
      } else {
        const device = {};
        row.values.slice(1).forEach((value, i) => { device[headers[i]] = value; });
        devices.push(device);
      }
    });
    assert.deepEqual(devices, [
      { name: "Router A", ip: "192.0.2.1", site: "North", poll_type: "snmp_only", max_bandwidth: 100 },
      { name: "Router B", ip: "192.0.2.2", site: "South", poll_type: "ping_only", max_bandwidth: 1000 },
    ]);
    assert.equal(imported.worksheets[0].getRow(1).font.bold, true);
  });

  test(`${name}: extended conditional formatting exercises UUID generation`, async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Formatting");
    sheet.addRows([[10], [100]]);
    sheet.addConditionalFormatting({
      ref: "A1:A2",
      rules: [{
        type: "dataBar",
        gradient: false,
        cfvo: [{ type: "min" }, { type: "max" }],
        color: { argb: "FF3366FF" },
      }],
    });
    const bytes = await workbook.xlsx.writeBuffer();
    const rule = sheet.conditionalFormattings[0].rules[0];
    assert.match(rule.x14Id, /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
    const imported = new ExcelJS.Workbook();
    await imported.xlsx.load(asArrayBuffer(bytes));
    assert.equal(imported.worksheets[0].getCell("A2").value, 100);
    assert.equal(imported.worksheets[0].conditionalFormattings[0].rules[0].type, "dataBar");
  });

  test(`${name}: malformed spreadsheets reject instead of silently importing`, async () => {
    const workbook = new ExcelJS.Workbook();
    await assert.rejects(workbook.xlsx.load(Buffer.from("not an xlsx file")));
  });
}
