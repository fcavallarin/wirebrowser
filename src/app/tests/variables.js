import { getUnresolvedVars, replaceVars } from "#src/common/utils.js";


const test = () => {
  const vars = {
    var1: "Variable1",
    var2: "Variable2",
  };
  const text = "Lorem Ipsum {{var3}} is {{var1}}{{var2}} {{=var1}} ={{var2}} ={{=var2}} {{==var2}} simply dummy text {{var1}} {{=var55}}";
  const expected = "Lorem Ipsum {{var3}} is Variable1Variable2 {{var1}} =Variable2 ={{var2}} {{=var2}} simply dummy text Variable1 {{var55}}";
  const replaced = replaceVars(text, vars);
  if (replaced != expected) {
    console.log(replaced)
    throw new Error("Variables sostitution failed");
  }

  const unresolved = getUnresolvedVars("Lorem Ipsum {{var1}} {{=var1}} {{=var3}} {{=var55}} {{var3}}", vars);
  if (unresolved.length !== 1 || !unresolved.includes('var3')) {
    console.log(unresolved)
    throw new Error("Unresolved variables detection failed");
  }
  console.log("OK");
}

test()