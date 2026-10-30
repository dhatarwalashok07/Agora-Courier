require("dotenv").config();
const express=require("express"),path=require("path");
const app=express(); app.use(express.json({limit:"50kb"})); app.use(express.static(path.join(__dirname,"public")));
app.use(express.static("public"));
const PORT=process.env.PORT||3000, BASE="https://apiv2.shiprocket.in/v1/external";
let cache={token:null,until:0};
const pinOK=p=>/^[1-9][0-9]{5}$/.test(String(p||"").trim());
async function token(){
 if(!process.env.SHIPROCKET_EMAIL||!process.env.SHIPROCKET_PASSWORD){let e=new Error("Shiprocket credentials are not configured on the server.");e.status=503;throw e;}
 if(cache.token&&Date.now()<cache.until)return cache.token;
 const r=await fetch(BASE+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.SHIPROCKET_EMAIL,password:process.env.SHIPROCKET_PASSWORD})});
 const d=await r.json().catch(()=>({})); if(!r.ok||!d.token){let e=new Error("Shiprocket authentication failed. Check credentials in Render Environment.");e.status=502;throw e;}
 cache={token:d.token,until:Date.now()+9*86400000}; return d.token;
}
app.get("/api/health",(_,res)=>res.json({ok:true,service:"AGORA ENTERPRISES courier backend"}));
app.post("/api/quote",async(req,res)=>{try{
 const pickup=String(req.body.pickupPincode||process.env.SHIPROCKET_PICKUP_PINCODE||"342001").trim(),delivery=String(req.body.deliveryPincode||"").trim();
 const weight=Number(req.body.weight),length=Number(req.body.length||10),breadth=Number(req.body.breadth||10),height=Number(req.body.height||10),cod=req.body.paymentMode==="cod"?1:0;
 if(!pinOK(pickup)||!pinOK(delivery))return res.status(400).json({error:"Enter valid 6-digit pickup and delivery PIN codes."});
 if(!(weight>0&&weight<=100)||![length,breadth,height].every(n=>Number.isFinite(n)&&n>0&&n<=300))return res.status(400).json({error:"Enter valid parcel weight and dimensions."});
 const t=await token(),u=new URL(BASE+"/courier/serviceability/");
 Object.entries({pickup_postcode:pickup,delivery_postcode:delivery,weight,cod,length,breadth,height}).forEach(([k,v])=>u.searchParams.set(k,String(v)));
 const r=await fetch(u,{headers:{Authorization:"Bearer "+t,Accept:"application/json"}}),d=await r.json().catch(()=>({}));
 if(!r.ok)return res.status(502).json({error:"Shiprocket could not return rates right now. Try again later."});
 const list=d.data?.available_courier_companies||[];
 res.json({ok:true,message:list.length?"Live courier options received from Shiprocket.":"No courier options found for these details.",couriers:list.map(c=>({name:c.courier_name,rate:Number(c.rate??c.freight_charge??0),eta:c.etd||c.estimated_delivery_days||"Not available"}))});
 }catch(e){res.status(e.status||500).json({error:e.message||"Unable to fetch rates."});}});
app.listen(PORT,"0.0.0.0",()=>console.log("AGORA server on "+PORT));
