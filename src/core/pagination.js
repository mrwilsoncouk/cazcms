export function paginate(url, rows, defaults={limit:25,max:100}){
  const page=Math.max(1, Number(url.searchParams.get('page')||1));
  const rawLimit=Number(url.searchParams.get('limit')||defaults.limit);
  const limit=Math.max(1, Math.min(defaults.max, rawLimit));
  const total=rows.length;
  const start=(page-1)*limit;
  return {page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit)),data:rows.slice(start,start+limit)};
}
