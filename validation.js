function validatePurchase(body, validCategoryIds) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {error: 'Request body must be a JSON object'};
  }
  if (typeof body.name !== 'string') return {error: 'Name is required'};
  const name = body.name.trim();
  if (name.length < 1 || name.length > 100) return {error: 'Name must be 1-100 characters'};
  const {quantity, unitPriceCents, categoryId} = body;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    return {error: 'Quantity must be an integer from 1 to 10,000'};
  }
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 1 || unitPriceCents > 100000000) {
    return {error: 'unitPriceCents must be an integer from 1 to 100,000,000'};
  }
  if (!Number.isInteger(categoryId) || !Array.isArray(validCategoryIds) || !validCategoryIds.includes(categoryId)) {
    return {error: 'categoryId must be an existing category ID'};
  }
  return {value: {name, quantity, unitPriceCents, categoryId}};
}
module.exports = {validatePurchase};
