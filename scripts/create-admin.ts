import 'dotenv/config';
import { hash } from 'bcryptjs';
import { db } from '../src/lib/server/db';
async function main(){
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password=process.env.ADMIN_PASSWORD;
  const name=process.env.ADMIN_NAME?.trim()||'Instrutor';
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length<12) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres). ADMIN_NAME é opcional.');
  if(await db.user.findUnique({where:{email}})) throw new Error('Conta já existente. Nenhuma senha foi alterada.');
  await db.user.create({data:{name,email,passwordHash:await hash(password,12),role:'INSTRUCTOR'}});
  console.log(`Instrutor criado: ${email}`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
