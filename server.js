require("dotenv").config();
const express=require("express"), helmet=require("helmet"), cors=require("cors"), rateLimit=require("express-rate-limit");
const bcrypt=require("bcryptjs"), jwt=require("jsonwebtoken"), {Pool}=require("pg"), crypto=require("crypto");
const path=require("path");
const app=express();
const PORT=process.env.PORT||3000;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("localhost")?false:{rejectUnauthorized:false}});
app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin:true}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:false}));
app.use(rateLimit({windowMs:15*60*1000,max:180}));
app.use(express.static(path.join(__dirname,"public")));
const q=(s,v=[])=>pool.query(s,v);
const clean=s=>String(s??"").trim();
const pinOK=s=>/^[1-9][0-9]{5}$/.test(clean(s));
const money=n=>Number(n).toFixed(2);
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,phone TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);
 await q(`CREATE TABLE IF NOT EXISTS bookings(id BIGSERIAL PRIMARY KEY,tracking_code TEXT UNIQUE NOT NULL,user_id BIGINT REFERENCES users(id),sender_name TEXT NOT NULL,sender_phone TEXT NOT NULL,pickup_address TEXT NOT NULL,pickup_city TEXT NOT NULL,pickup_pin TEXT NOT NULL,receiver_name TEXT NOT NULL,receiver_phone TEXT NOT NULL,delivery_address TEXT NOT NULL,delivery_city TEXT NOT NULL,delivery_pin TEXT NOT NULL,weight NUMERIC NOT NULL,length NUMERIC NOT NULL,breadth NUMERIC NOT NULL,height NUMERIC NOT NULL,payment_mode TEXT NOT NULL,courier_name TEXT,courier_id TEXT,quote_amount NUMERIC,status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',payment_status TEXT NOT NULL DEFAULT 'PENDING',payu_txnid TEXT,shiprocket_order_id TEXT,awb_code TEXT,tracking_url TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`);
 await q(`CREATE TABLE IF NOT EXISTS payments(id BIGSERIAL PRIMARY KEY,booking_id BIGINT REFERENCES bookings(id),provider TEXT NOT NULL,transaction_id TEXT UNIQUE,status TEXT NOT NULL,amount NUMERIC,raw_response JSONB,created_at TIMESTAMPTZ DEFAULT NOW())`);
}
function auth(req,res,next){try{const t=(req.headers.authorization||"").replace(/^Bearer /,"");req.user=jwt.verify(t,process.env.SESSION_SECRET);next()}catch{return res.status(401).json({error:"Please login"})}}
function admin(req,res,next){if(!req.user?.admin)return res.status(403).json({error:"Admin access required"});next()}
function tokenFor(user){return jwt.sign({id:user.id,email:user.email,admin:false},process.env.SESSION_SECRET,{expiresIn:"7d"})}
async function shipToken(){
 if(!process.env.SHIPROCKET_EMAIL||!process.env.SHIPROCKET_PASSWORD)throw new Error("Shiprocket credentials are not configured");
 if(global.srToken&&global.srExpiry>Date.now()+60000)return global.srToken;
 const r=await fetch("https://apiv2.shiprocket.in/v1/external/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.SHIPROCKET_EMAIL,password:process.env.SHIPROCKET_PASSWORD})});
 const d=await r.json();if(!r.ok||!d.token)throw new Error(d.message||"Shiprocket authentication failed");
 global.srToken=d.token;global.srExpiry=Date.now()+9*24*60*60*1000;return d.token;
}
app.get("/api/health",async(req,res)=>{try{await q("SELECT 1");res.json({ok:true,service:"AGORA ENTERPRISES",database:"connected"})}catch(e){res.status(503).json({ok:false,error:"Database unavailable"})}});
app.post("/api/register",async(req,res)=>{try{
 const {name,email,phone,password}=req.body; if(!clean(name)||!/^\S+@\S+\.\S+$/.test(clean(email))||!/^\d{10}$/.test(clean(phone))||String(password||"").length<8)return res.status(400).json({error:"Enter valid name, email, 10-digit phone and password (8+ characters)."});
 const hash=await bcrypt.hash(password,12),r=await q("INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email,phone",[clean(name),clean(email).toLowerCase(),clean(phone),hash]);
 res.json({token:tokenFor(r.rows[0]),user:r.rows[0]});
 }catch(e){res.status(400).json({error:e.code==="23505"?"Email already registered":"Could not register account"})}});
app.post("/api/login",async(req,res)=>{const email=clean(req.body.email).toLowerCase(),r=await q("SELECT * FROM users WHERE email=$1",[email]);if(!r.rowCount||!await bcrypt.compare(String(req.body.password||""),r.rows[0].password_hash))return res.status(401).json({error:"Invalid email or password"});const u=r.rows[0];res.json({token:tokenFor(u),user:{id:u.id,name:u.name,email:u.email,phone:u.phone}})});
app.get("/api/me",auth,async(req,res)=>{const r=await q("SELECT id,name,email,phone FROM users WHERE id=$1",[req.user.id]);res.json(r.rows[0]||null)});
app.post("/api/quote",async(req,res)=>{try{
 const b=req.body;if(!pinOK(b.pickup_pin)||!pinOK(b.delivery_pin))return res.status(400).json({error:"Enter valid 6-digit pickup and delivery PIN codes"});
 const weight=Number(b.weight),dims=[b.length,breadth=b.breadth,b.height].map(Number);
 if(!(weight>0&&weight<=100)||dims.some(x=>!(x>0&&x<=300)))return res.status(400).json({error:"Enter valid parcel weight and dimensions"});
 const t=await shipToken(),u=new URL("https://apiv2.shiprocket.in/v1/external/courier/serviceability/");
 Object.entries({pickup_postcode:b.pickup_pin,delivery_postcode:b.delivery_pin,weight,cod:b.payment_mode==="COD"?1:0,length:dims[0],breadth:dims[1],height:dims[2]}).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u,{headers:{Authorization:"Bearer "+t}}),d=await r.json();if(!r.ok)return res.status(502).json({error:d.message||"Could not fetch courier rates"});
 const list=d.data?.available_courier_companies||[];res.json({ok:true,couriers:list.slice(0,12).map(c=>({id:c.courier_company_id,name:c.courier_name,rate:Number(c.rate),etd:c.etd||c.estimated_delivery_days||"Not available"}))});
 }catch(e){res.status(502).json({error:e.message||"Rate lookup failed"})}});
app.post("/api/bookings",auth,async(req,res)=>{try{
 const b=req.body,required=["sender_name","sender_phone","pickup_address","pickup_city","pickup_pin","receiver_name","receiver_phone","delivery_address","delivery_city","delivery_pin"];
 if(required.some(k=>!clean(b[k]))||!pinOK(b.pickup_pin)||!pinOK(b.delivery_pin)||!/^\d{10}$/.test(clean(b.sender_phone))||!/^\d{10}$/.test(clean(b.receiver_phone)))return res.status(400).json({error:"Complete all sender/receiver details with valid phone numbers and PIN codes"});
 const nums=["weight","length","breadth","height","quote_amount"].map(k=>Number(b[k]));if(nums.some(n=>!Number.isFinite(n)||n<=0))return res.status(400).json({error:"Invalid parcel or quote details"});
 const code="AG"+Date.now().toString().slice(-8)+crypto.randomBytes(2).toString("hex").toUpperCase();
 const r=await q(`INSERT INTO bookings(tracking_code,user_id,sender_name,sender_phone,pickup_address,pickup_city,pickup_pin,receiver_name,receiver_phone,delivery_address,delivery_city,delivery_pin,weight,length,breadth,height,payment_mode,courier_name,courier_id,quote_amount)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id,tracking_code,status,payment_status,quote_amount`,
 [code,req.user.id,...required.map(k=>clean(b[k])),...nums.slice(0,4),b.payment_mode==="COD"?"COD":"PREPAID",clean(b.courier_name),clean(b.courier_id),nums[4]]);
 res.json({ok:true,booking:r.rows[0],message:"Booking request saved. Payment is pending; shipment is not created yet."});
 }catch(e){res.status(500).json({error:"Could not save booking"})}});
app.get("/api/bookings",auth,async(req,res)=>{const r=await q("SELECT id,tracking_code,status,payment_status,quote_amount,courier_name,awb_code,tracking_url,created_at FROM bookings WHERE user_id=$1 ORDER BY id DESC",[req.user.id]);res.json(r.rows)});
app.get("/api/track/:code",async(req,res)=>{const r=await q("SELECT tracking_code,status,payment_status,courier_name,awb_code,tracking_url,created_at FROM bookings WHERE tracking_code=$1",[clean(req.params.code)]);if(!r.rowCount)return res.status(404).json({error:"Tracking number not found"});res.json(r.rows[0])});
app.post("/api/admin/login",async(req,res)=>{const email=clean(req.body.email).toLowerCase(),password=String(req.body.password||"");if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||email!==process.env.ADMIN_EMAIL.toLowerCase()||password!==process.env.ADMIN_PASSWORD)return res.status(401).json({error:"Invalid admin credentials"});const t=jwt.sign({id:0,email,admin:true},process.env.SESSION_SECRET,{expiresIn:"8h"});res.json({token:t,message:"Admin login successful"})});
app.get("/api/admin/summary",auth,admin,async(req,res)=>{const [a,b,c]=await Promise.all([q("SELECT COUNT(*)::int n FROM bookings"),q("SELECT COUNT(*)::int n FROM users"),q("SELECT COALESCE(SUM(quote_amount),0)::numeric(12,2) n FROM bookings WHERE payment_status='SUCCESS'")]);res.json({bookings:a.rows[0].n,customers:b.rows[0].n,paid_amount:b.rows[0].n?c.rows[0].n:"0.00"})});
app.get("/api/admin/bookings",auth,admin,async(req,res)=>{const r=await q("SELECT b.*,u.email customer_email FROM bookings b LEFT JOIN users u ON u.id=b.user_id ORDER BY b.id DESC LIMIT 300");res.json(r.rows)});
app.patch("/api/admin/bookings/:id",auth,admin,async(req,res)=>{const allowed=["CONFIRMED","CANCELLED","IN_TRANSIT","DELIVERED","PAYMENT_PENDING"];const s=clean(req.body.status);if(!allowed.includes(s))return res.status(400).json({error:"Invalid status"});const r=await q("UPDATE bookings SET status=$1 WHERE id=$2 RETURNING id,status",[s,req.params.id]);if(!r.rowCount)return res.status(404).json({error:"Booking not found"});res.json(r.rows[0])});
app.post("/api/admin/bookings/:id/create-shipment",auth,admin,async(req,res)=>{try{
 const br=await q("SELECT * FROM bookings WHERE id=$1",[req.params.id]);if(!br.rowCount)return res.status(404).json({error:"Booking not found"});const b=br.rows[0];
 if(b.payment_mode!=="COD"&&b.payment_status!=="SUCCESS")return res.status(400).json({error:"Payment must be verified before shipment creation"});
 if(b.awb_code)return res.status(400).json({error:"Shipment already created"});
 const t=await shipToken(),payload={order_id:b.tracking_code,order_date:new Date().toISOString().slice(0,10),pickup_location:"Primary",billing_customer_name:b.receiver_name,billing_last_name:"",billing_address:b.delivery_address,billing_city:b.delivery_city,billing_pincode:b.delivery_pin,billing_state:"",billing_country:"India",billing_email:"",billing_phone:b.receiver_phone,shipping_is_billing:true,order_items:[{name:"Courier Parcel",sku:b.tracking_code,units:1,selling_price:Number(b.quote_amount),discount:0,tax:0, hsn:""}],payment_method:b.payment_mode==="COD"?"COD":"Prepaid",sub_total:Number(b.quote_amount),length:Number(b.length),breadth:Number(b.breadth),height:Number(b.height),weight:Number(b.weight)};
 const cr=await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",{method:"POST",headers:{Authorization:"Bearer "+t,"Content-Type":"application/json"},body:JSON.stringify(payload)}),cd=await cr.json();if(!cr.ok)return res.status(502).json({error:cd.message||"Shiprocket order creation failed",details:cd});
 await q("UPDATE bookings SET shiprocket_order_id=$1,status='CONFIRMED' WHERE id=$2",[String(cd.order_id||""),b.id]);res.json({ok:true,shiprocket:cd,message:"Order created. Assign courier/AWB from Shiprocket dashboard, then update booking."});
 }catch(e){res.status(502).json({error:e.message||"Shipment creation failed"})}});
app.post("/api/admin/bookings/:id/awb",auth,admin,async(req,res)=>{const awb=clean(req.body.awb_code),url=clean(req.body.tracking_url);if(!awb)return res.status(400).json({error:"AWB required"});const r=await q("UPDATE bookings SET awb_code=$1,tracking_url=$2,status='IN_TRANSIT' WHERE id=$3 RETURNING id,awb_code,status,tracking_url",[awb,url,req.params.id]);if(!r.rowCount)return res.status(404).json({error:"Booking not found"});res.json(r.rows[0])});
function sha(s){return crypto.createHash("sha512").update(s).digest("hex")}
app.post("/api/payu/initiate",auth,async(req,res)=>{try{
 if(!process.env.PAYU_KEY||!process.env.PAYU_SALT)return res.status(503).json({error:"PayU merchant credentials are not configured/activated"});
 const r=await q("SELECT * FROM bookings WHERE id=$1 AND user_id=$2",[req.body.booking_id,req.user.id]);if(!r.rowCount)return res.status(404).json({error:"Booking not found"});
 const b=r.rows[0];if(b.payment_status==="SUCCESS")return res.status(400).json({error:"Already paid"});
 const txnid="AG"+Date.now()+crypto.randomBytes(3).toString("hex"),amount=money(b.quote_amount),product="Courier booking "+b.tracking_code;
 const fields={key:process.env.PAYU_KEY,txnid,amount,productinfo:product,firstname:b.sender_name,email:(await q("SELECT email FROM users WHERE id=$1",[req.user.id])).rows[0].email,phone:b.sender_phone,surl:process.env.PAYU_SUCCESS_URL||process.env.BASE_URL+"/api/payu/success",furl:process.env.PAYU_FAILURE_URL||process.env.BASE_URL+"/api/payu/failure"};
 const hash=sha([fields.key,fields.txnid,fields.amount,fields.productinfo,fields.firstname,fields.email,"","","","","","","","","","",process.env.PAYU_SALT].join("|"));
 await q("UPDATE bookings SET payu_txnid=$1 WHERE id=$2",[txnid,b.id]);res.json({action:process.env.PAYU_BASE_URL||"https://test.payu.in",fields:{...fields,hash}});
 }catch(e){res.status(500).json({error:"Could not initiate payment"})}});
async function payuCallback(req,res){
 try{
 const p=req.body,salt=process.env.PAYU_SALT;if(!salt)return res.status(503).send("PayU not configured");
 const reverse=[salt,p.status,"","","","","","","","","","","","","",p.email,p.firstname,p.productinfo,p.amount,p.txnid,p.key].join("|");
 const expected=sha(reverse);if(expected!==String(p.hash||"").toLowerCase())return res.status(400).send("Invalid payment signature");
 const success=String(p.status).toLowerCase()==="success";
 const r=await q("UPDATE bookings SET payment_status=$1,status=$2 WHERE payu_txnid=$3 RETURNING id,tracking_code,quote_amount", [success?"SUCCESS":"FAILED",success?"CONFIRMED":"PAYMENT_PENDING",p.txnid]);
 if(r.rowCount)await q("INSERT INTO payments(booking_id,provider,transaction_id,status,amount,raw_response) VALUES($1,'PAYU',$2,$3,$4,$5) ON CONFLICT(transaction_id) DO NOTHING",[r.rows[0].id,p.txnid,success?"SUCCESS":"FAILED",r.rows[0].quote_amount,JSON.stringify({status:p.status,mode:p.mode,bank_ref_num:p.bank_ref_num})]);
 res.redirect((process.env.BASE_URL||"")+"/?payment="+(success?"success":"failed")+"&booking="+(r.rows[0]?.tracking_code||""));
 }catch(e){res.status(500).send("Payment callback could not be processed")}}
app.post("/api/payu/success",payuCallback);app.post("/api/payu/failure",payuCallback);
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("AGORA server listening on "+PORT))).catch(e=>{console.error("Startup failed:",e.message);process.exit(1)});
