function sum(a, b) {
  return a + b;
}

function thrower() {
  throw new Error("boom");
}

function returnObject() {
  return { x: 1, y: 2 };
}

function nested(a) {
  return sum(a, 10);
}

function recursive(n) {
  if (n <= 0) return 0;
  return recursive(n - 1) + 1;
}

async function asyncNoAwait(a) {
  return a * 2;
}

async function asyncWithAwait(a) {
  const res = await Promise.resolve(a * 3);
  return res;
}

function promiseChain(a) {
  return Promise.resolve(a)
    .then(v => v + 1)
    .then(v => v * 2);
}

function rejectedPromise() {
  return Promise.reject(new Error("reject!"));
}

function returnFnc() {
  return () => { const y = 1 }
}

async function realAsync(x) {
  await new Promise(resolve => setTimeout(resolve, 5));
  console.log(x)
  return x
}

function sync(x) {
  return x;
}

function retVal0(x) {
  const y = "overridden";
  return x;
}

function retVal() {
  const x = retVal0(1);
  return x;
}

async function retVal0A(x) {
  await new Promise(resolve => setTimeout(resolve, 5));
  const y = "overridden";
  return x;
}

async function retValA() {
  const x = await retVal0A(1);
  return x;
}

async function longFunction() {
  const doNothing = () => { }
  let x = 21;
  doNothing();
  x = 22;
  x = 23
  doNothing()
  x = 24; x=25;
  return x + 1;
}

async function withConst() {
  const x = 1;
  let y = 9;
  if( x > 12){
    console.log(x)
    y += 1
  }
  console.log(y)
}

async function main() {
  console.log("=== RUN TESTS ===");

  sum(1, 2);

  try {
    thrower();
  } catch (e) { }

  returnObject();
  nested(5);
  recursive(3);

  await asyncNoAwait(2);
  await asyncWithAwait(3);

  await promiseChain(5);

  try {
    await rejectedPromise();
  } catch (e) { }

  returnFnc();


  let x1;
  x1 = await realAsync(1)
  x1 = await realAsync(2)
  realAsync(3).then(x2 => { })

  x1 = sync(4);

  x1 = retVal()

  x1 = await retValA()

  await longFunction()
  await withConst()
  // Not working
  // Promise.all([
  //   realAsync(5),
  //   realAsync(7)
  // ])
}
