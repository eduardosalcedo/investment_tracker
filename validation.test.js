const test = require('node:test');
const assert = require('node:assert/strict');
const {validatePurchase} = require('./validation');
test('valid purchase and trimmed name',()=> {
  assert.deepEqual(validatePurchase({name:' Fund ',quantity:5,unitPriceCents:2000,categoryId:1},[1,2,3]),
    {value:{name:'Fund',quantity:5,unitPriceCents:2000,categoryId:1}});
});
test('invalid quantity and unchanged input',()=> {
  for (const quantity of [0,1.5,10001,'5',true,null,NaN,Infinity]) {
    const body={name:'Fund',quantity,unitPriceCents:2000,categoryId:1};
    assert.ok(validatePurchase(body,[1,2,3]).error);
    assert.ok(Object.is(body.quantity,quantity));
  }
});
test('invalid price and category',()=> {
  for (const cents of [0,1.5,100000001,'100',true]) {
    assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:cents,categoryId:1},[1,2,3]).error);
  }
  assert.ok(validatePurchase({name:'Fund',quantity:1,unitPriceCents:100,categoryId:99},[1,2,3]).error);
});
test('non-object bodies rejected',()=> {
  for (const body of [null,undefined,[],'x',5,true]) {
    assert.ok(validatePurchase(body,[1,2,3]).error);
  }
});
test('name boundaries',()=> {
  const ok=n=>validatePurchase({name:n,quantity:1,unitPriceCents:100,categoryId:1},[1,2,3]);
  for (const n of ['','   ',undefined,null,5,'x'.repeat(101)]) assert.ok(ok(n).error);
  assert.equal(ok('x').value.name,'x');
  assert.equal(ok('x'.repeat(100)).value.name.length,100);
  assert.equal(ok('  '+'x'.repeat(100)+'  ').value.name.length,100);
});
test('upper and lower boundaries are valid',()=> {
  assert.deepEqual(validatePurchase({name:'A',quantity:10000,unitPriceCents:100000000,categoryId:3},[1,2,3]),
    {value:{name:'A',quantity:10000,unitPriceCents:100000000,categoryId:3}});
  assert.ok(validatePurchase({name:'A',quantity:1,unitPriceCents:1,categoryId:1},[1,2,3]).value);
});
test('category type and ignored extra fields',()=> {
  for (const c of ['1',true,null,undefined,1.5,NaN]) {
    assert.ok(validatePurchase({name:'A',quantity:1,unitPriceCents:1,categoryId:c},[1,2,3]).error);
  }
  const r=validatePurchase({name:'A',quantity:1,unitPriceCents:1,categoryId:1,ownerId:9,costCents:1,id:5},[1,2,3]);
  assert.deepEqual(Object.keys(r.value).sort(),['categoryId','name','quantity','unitPriceCents']);
});
