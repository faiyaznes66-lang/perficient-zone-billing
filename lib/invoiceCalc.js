export function calculateInvoice(input={}){
  const mode=input.vat_mode==="inclusive"?"inclusive":"exclusive";
  const items=Array.isArray(input.items)?input.items:[];
  let subtotal=0, rawTax=0;

  const rawItems=items.map((item,idx)=>{
    const quantity=Math.max(0,Number(item.quantity)||0);
    const rate=Math.max(0,Number(item.rate)||0);
    const discount=Math.min(100,Math.max(0,Number(item.discount_percent)||0));
    const category=["zero","exempt","out_of_scope"].includes(item.tax_category)?item.tax_category:"standard";
    const taxRate=category==="standard"?Math.max(0,Number(item.tax_rate)||0):0;
    const beforeDiscount=quantity*rate;
    const lineDiscount=beforeDiscount*(discount/100);
    const gross=beforeDiscount-lineDiscount;
    let net,tax,total;
    if(mode==="inclusive" && taxRate>0){
      net=gross/(1+taxRate/100);
      tax=gross-net;
      total=gross;
    }else{
      net=gross;
      tax=net*taxRate/100;
      total=net+tax;
    }
    subtotal+=net; rawTax+=tax;
    return {
      position:idx,
      item_name:String(item.item_name||"Item").trim()||"Item",
      description:item.description?String(item.description):null,
      quantity,unit:item.unit?String(item.unit):null,rate,
      discount_percent:discount,tax_rate:taxRate,tax_category:category,
      _net:net,_tax:tax,_total:total
    };
  });

  subtotal=round(subtotal);rawTax=round(rawTax);
  const discountType=input.discount_type==="percent"?"percent":"fixed";
  const discountValue=Math.max(0,Number(input.discount_value ?? input.discount_amount)||0);
  const requested=discountType==="percent"?subtotal*Math.min(100,discountValue)/100:discountValue;
  const discountAmount=Math.min(subtotal,requested);
  const ratio=subtotal>0?(subtotal-discountAmount)/subtotal:1;

  const calculated=rawItems.map(it=>({
    position:it.position,item_name:it.item_name,description:it.description,quantity:it.quantity,unit:it.unit,rate:it.rate,
    discount_percent:it.discount_percent,tax_rate:it.tax_rate,tax_category:it.tax_category,
    line_subtotal:round(it._net*ratio),line_tax:round(it._tax*ratio),line_total:round(it._total*ratio)
  }));
  const vat=round(calculated.reduce((s,it)=>s+it.line_tax,0));
  const taxable=round(subtotal-discountAmount);
  const total=round(mode==="inclusive"?calculated.reduce((s,it)=>s+it.line_total,0):taxable+vat);

  return {
    items:calculated,
    subtotal,
    discount_type:discountType,
    discount_value:round(discountValue),
    discount_amount:round(discountAmount),
    taxable_amount:taxable,
    vat_amount:vat,
    total
  };
}
function round(n){return Math.round((Number(n)||0)*100+Number.EPSILON)/100;}