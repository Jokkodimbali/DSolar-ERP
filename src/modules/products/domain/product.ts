export interface ProductRecord { id:string; sku:string; name:string; description:string|null; unit:string; active:boolean; categoryId:string|null; brandId:string|null; taxRegimeId:string|null; isSolarPlant:boolean; }
export interface CreateProduct { sku:string; name:string; description?:string; unit?:string; categoryId?:string; brandId?:string; taxRegimeId?:string; isSolarPlant?:boolean; }
export interface UpdateProduct { name?:string; description?:string|null; unit?:string; categoryId?:string|null; brandId?:string|null; taxRegimeId?:string|null; isSolarPlant?:boolean; }
