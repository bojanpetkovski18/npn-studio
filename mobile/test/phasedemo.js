// Demo capture, phone (not an acceptance test): the mobile journey on the fictional samples at 390×844.
//   electron mobile/test/e2e.js <dataDir> <outDir> demo light
const { until, setup } = require('./helpers');

module.exports = async (ctx) => {
  const { js, shot, tap, wait, log } = ctx;
  await setup(ctx);
  await tap('#tabbar [data-tab="cases"]');
  await until(js, wait, 'document.querySelectorAll("#vrows .case").length > 3');
  await shot('cases');
  await js('(() => { const c = [...document.querySelectorAll("#vrows .case")].find((x) => x.querySelector(".tag.emb")) || document.querySelector("#vrows .case"); c.querySelector(".main").click(); return 0; })()');
  await until(js, wait, '!!document.querySelector("#sheetBody .paper")');
  await shot('sheet');
  await js('history.back(); 0');
  await wait(400);
  await tap('#tabbar [data-tab="gen"]');
  await until(js, wait, '!!document.querySelector("#gGo")');
  await tap('#gGo');
  await until(js, wait, '!!document.querySelector("#gSave")', 60000);
  await js('document.querySelectorAll(".toast").forEach((t) => t.remove()); document.querySelector("#gRun").scrollIntoView({ block: "center" }); 0');
  await wait(500);
  await shot('generated');
  log('phone demo: ', await js('__nalogix.result.count + " documents"'));
};
