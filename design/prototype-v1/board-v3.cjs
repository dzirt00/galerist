const fs=require('fs');
const {C,add,rect,text,title,line,circle,pawn,meeple,people,coin,button,pill,ticket,art,artcard,header,track,room,garden,footer,start,end}=require('./board-concepts.cjs');
const brown='#724944',pink='#C84187',visitorBrown='#946040',purple='#823A92';
// A new outline icon set. All symbols are editable vector paths.
const paths={
 digital:'<path d="M12 2L22 8V18L12 24L2 18V8ZM2 8L12 14L22 8M12 14V24M12 2V14M2 18L12 14L22 18"/>',
 photo:'<path d="M3 7H8L10 3H17L19 7H23V22H3Z"/><circle cx="13" cy="14" r="5"/><path d="M5 10H7"/>',
 sculpture:'<path d="M7 23H20V20H7ZM9 20V16L5 11L8 5L12 3L17 7L20 14L16 17V20M8 5L13 9L17 7M13 9L11 15L16 17"/>',
 painting:'<path d="M13 2C4 2 1 8 2 14C3 20 11 24 15 22C18 20 11 17 15 14C18 11 25 17 24 9C23 4 18 2 13 2Z"/><circle cx="8" cy="8" r="1"/><circle cx="14" cy="6" r="1"/><circle cx="6" cy="14" r="1"/><path d="M17 20L24 24"/>',
 star:'<path d="M13 2L16 9L24 10L18 16L20 24L13 20L6 24L8 16L2 10L10 9Z"/>',
 hammer:'<path d="M4 4L9 1L17 11L12 15ZM12 12L22 23M2 24H12M3 21H11V24"/>',
 influence:'<circle cx="13" cy="10" r="3"/><path d="M7 16C1 9 6 1 13 1C20 1 25 9 19 16M9 13L7 23H19L17 13M5 19C-4 8 3 -3 13 -3"/>',
 money:'<circle cx="13" cy="13" r="11"/><path d="M17 7H10C6 7 6 12 11 13L15 14C20 16 17 20 10 19M13 4V22"/>',
 ticket:'<path d="M2 5H24V10C18 10 18 16 24 16V21H2V16C8 16 8 10 2 10ZM10 5V21M16 5V21"/>',
 staff:'<circle cx="13" cy="5" r="3"/><path d="M8 10H18L22 17L18 19L16 15V24H10V15L8 19L4 17Z"/>',
 visitors:'<circle cx="7" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><path d="M2 22V14Q7 8 12 14V22ZM14 22V14Q19 8 24 14V22"/>',
 gallery:'<path d="M2 23V7L13 1L24 7V23ZM6 10H20V19H6ZM10 23V19M16 23V19"/>',
 order:'<path d="M5 5H23V24H5ZM2 20V2H20M9 10H19M9 14H19M9 18H16"/>',
 media:'<path d="M3 9H9L21 3V22L9 16H3ZM9 16L12 24H7L5 16M24 8L27 6M24 17L27 19"/>',
 sale:'<path d="M2 8L8 5L13 8L18 5L24 8L21 18L17 21L11 19L7 21L2 16ZM8 10L13 8L17 12L14 15L10 13M14 15L19 19M10 17L14 20"/>'
};
const iconBounds={digital:[2,2,22,24],photo:[3,3,23,22],sculpture:[5,3,20,23],painting:[2,2,24,24],star:[2,2,24,24],hammer:[2,1,22,24],influence:[-2,-3,24,23],money:[2,2,24,24],ticket:[2,5,24,21],staff:[4,2,22,24],visitors:[2,3,24,22],gallery:[2,1,24,23],order:[2,2,23,24],media:[3,3,27,24],sale:[2,5,24,21]};
function icon(x,y,name,size=22,color=brown){const b=iconBounds[name]||iconBounds.star;const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,scale=22/Math.max(b[2]-b[0],b[3]-b[1]);add(`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 30 30"><g transform="translate(15 15) scale(${scale}) translate(${-cx} ${-cy})" fill="none" stroke="${color}" stroke-width="${1.8/scale}" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.star}</g></svg>`)}
function badge(x,y,name,size=26,color=brown){circle(x+size/2,y+size/2,size/2,C.paper,'#C7C9BC');icon(x+3,y+3,name,size-6,color)}
const reputationFaces=[['photo',1,3,15],['painting',1,3,16],['digital',1,3,17],['sculpture',1,3,18],['hammer',1,3,8],['staff',1,1,9],['gallery',1,3,13],['sale',1,3,12],['star',1,2,7],['media',0,2,10],['visitors',0,1,5],['star',2,4,20],['digital',1,2,14],['visitors',1,3,2],['visitors',1,2,3],['visitors',1,2,4]];
function repToken(x,y,size,index=0){const [symbol,inf,cash,id]=reputationFaces[index%reputationFaces.length];rect(x+2,y+3,size,size,'#727C6D',4);rect(x,y,size,size,'#F3F0E3',4,'#ADAE99',1.3);rect(x+3,y+3,size-6,size-6,'none',2,'#D7D4BF');icon(x+size*.22,y+size*.11,symbol,size*.56,brown);if(size>40)text(x+size/2,y+size*.88,`${inf?inf+' вл. · ':''}${cash} мон.`,size*.13,C.ink,600,undefined,'middle');else{circle(x+size*.25,y+size*.78,size*.12,pink);text(x+size*.25,y+size*.82,inf, size*.17,C.paper,700,undefined,'middle');circle(x+size*.7,y+size*.78,size*.12,visitorBrown);text(x+size*.7,y+size*.82,cash,size*.17,C.paper,700,undefined,'middle')};}
function orderCard(x,y,w,h,genre,reward,label='Заказ'){const pad=w>100?6:4,gap=4,footerH=w>100?18:0,panelW=w-pad*2,panelH=(h-pad*2-gap-footerH)/2,iconSize=Math.min(panelW*.57,panelH*.78);rect(x+3,y+4,w,h,'#6B7162',4);rect(x,y,w,h,C.paper,5,'#D1CBB8',1.5);[genre,reward].forEach((name,i)=>{const py=y+pad+i*(panelH+gap);rect(x+pad,py,panelW,panelH,i?'#E8BFC5':'#743C42',3);icon(x+(w-iconSize)/2,py+(panelH-iconSize)/2,name,iconSize,i?brown:C.paper)});if(footerH)text(x+w/2,y+h-8,label,9,C.ink,600,undefined,'middle');}
function influence(x,y,n){badge(x,y,'influence',25,pink);text(x+31,y+18,n,13,pink,700)}
function actiontiles(x,y,items,size=34){const gap=5,isize=size*.71;items.forEach((k,i)=>{const xx=x+i*(size+gap);rect(xx+2,y+3,size,size,'#888F80',4);rect(xx,y,size,size,C.paper,4,'#B9BAA9');icon(xx+(size-isize)/2,y+(size-isize)/2,k,isize)})}
function artistSignatures(x,y,initials,color,genre){
 add(`<g aria-label="Две подписи художника ${initials}">`);
 for(let i=0;i<2;i++){const xx=x+3+i*35;rect(xx+1,y+2,32,15,'#616F64',7);rect(xx,y,32,15,color,7,'#E9E9D7',.8);icon(xx+3,y+2,genre,11,C.paper);text(xx+22,y+10.5,initials,6.5,C.paper,600,undefined,'middle')}
 add('</g>');
}
function mediaSupply(){
 add('<g aria-label="Медиацентр: пять уровней рекламы, четыре жетона каждого уровня и их награды">');
 rect(24,822,1392,104,'#DDE0CC',5,'#A16E61',1.5);rect(24,822,8,104,'#A16E61',2);
 text(44,846,'МЕДИАЦЕНТР',13,'#905D50',700);text(44,865,'ЖЕТОНЫ РЕКЛАМЫ',10,C.dark,700);text(44,890,'Уровни 1–5',10,C.muted);text(44,908,'По 4 жетона каждого уровня',9,C.muted);
 const rewards=[['ticket','Любой билет'],['influence','Влияние'],['ticket','2 разных билета'],['money','Монеты'],['visitors','Любой посетитель']];
 rewards.forEach(([symbol,label],i)=>{const xx=252+i*228;rect(xx,834,216,80,'#F1ECDD',4,'#C7C9B4');text(xx+12,851,'УРОВЕНЬ '+(i+1),9,C.dark,700);icon(xx+158,840,'influence',19,pink);text(xx+187,855,i+1,13,pink,700,undefined,'middle');
  for(let j=3;j>=0;j--){rect(xx+12+j*2,862+j*3,34,27,'#8D5064',4,'#E9D3CF',.6)}text(xx+29,880,i+1,16,C.paper,700,undefined,'middle');text(xx+58,894,'×4',10,C.muted,600);
  icon(xx+80,868,symbol,28,symbol==='influence'?pink:brown);text(xx+112,886,label,9,C.ink,600);
 });add('</g>');
}
function vestibule(x,y,color,visitors,name){
 add(`<ellipse cx="${x+2}" cy="${y+6}" rx="70" ry="28" fill="#5E665B"/><ellipse cx="${x}" cy="${y}" rx="70" ry="28" fill="#DBDECB" stroke="#848E7C" stroke-width="2"/><ellipse cx="${x}" cy="${y-5}" rx="63" ry="23" fill="url(#tiles)" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>`);
 people(x-(visitors.length-1)*11.5,y-9,visitors,.63);text(x,y+16,name,7,C.ink,600,undefined,'middle');
}
// Three columns, four reputation rows, three auction rows, true fixed bid values.
function market(x,y,w,h,large=false){
 rect(x,y,w,h,'#91AAA0',4,'#E2E7D8',2);rect(x+3,y+3,w-6,h-6,'url(#paper)',2);
 text(x+12,y+21,'МЕЖДУНАРОДНЫЙ РЫНОК',large?13:9,C.paper,700);
 const label=large?76:32, cw=(w-label-16)/3, left=x+label, top=y+94;
 const rh=(h-193)/7, s=large?29:21;
 for(let c=0;c<3;c++){
  const xx=left+c*cw;rect(xx,y+34,cw-3,h-65,'none',5,'#D6DED1',1);
  influence(xx+cw/2-20,y+38,3-c);text(xx+cw/2,y+80,c+1,10,C.paper,700,undefined,'middle');
  for(let r=0;r<4;r++){
   const yy=top+r*rh;rect(xx+6,yy,cw-12,rh-6,'#C9D6CB',5,'#E8ECDF');
   // Face of a reputation token, no invented printed cell reward.
   if(c===0&&r===1){meeple(xx+cw/2,yy+(rh-6)/2,C.blue,large?.8:.55)}else{const size=large?47:29;repToken(xx+(cw-size)/2,yy+(rh-6-size)/2,size,r*3+c)}
  }
 }
 ['digital','photo','sculpture','painting'].forEach((n,r)=>{const size=large?30:21;icon(x+(label-size)/2,top+r*rh+(rh-6-size)/2,n,size)});
 const ay=top+4*rh+7;line(x+8,ay-5,x+w-8,ay-5,'#DCE4D6',2);
 if(large)text(x+9,ay+10,'СТАВКИ',9,C.paper,700);
 const rewards=[['ticket','staff','ticket'],['staff','influence','money'],['visitors','money','influence']];
 for(let r=0;r<3;r++){
  const yy=ay+r*rh;coin(x+label/2,yy+rh/2,[1,3,6][r]);
  for(let c=0;c<3;c++){
   const xx=left+c*cw;rect(xx+6,yy,cw-12,rh-6,'#DADCC8',4,'#EFF0E0');icon(xx+(cw-s)/2,yy+(rh-6-s)/2,rewards[r][c],s,rewards[r][c]==='influence'?pink:brown);
   if(r===0&&c===2)text(xx+cw-20,yy+rh-12,'2',10,brown,700);
   if(r===1&&c===1){rect(xx+5,yy-1,cw-10,rh-4,'none',4,C.blue,2);meeple(xx+cw-25,yy+rh-20,C.blue,large?.58:.4)}
  }
 }
 const by=y+h-40;
 [[6,3,1],[10,6,3],[15,10,6]].forEach((v,c)=>text(left+c*cw+cw/2,by,v.join(' / '),large?12:8,C.paper,600,undefined,'middle'));
 if(large)text(x+12,y+h-12,'Лидерство колонок: 1-е / 2-е / 3-е место',10,C.paper);
 else text(x+12,y+h-12,'1-е / 2-е / 3-е место · монеты',8,C.paper);
}
function locationNode(x,y,name,actions,color,tokenIndex,{vertical=false,piece=C.blue,selected=-1,height=44}={}){
 add(`<g aria-label="${name}: место галериста, два действия и репутация">`);
 const w=vertical?74:298,h=vertical?132:height;
 rect(x+2,y+3,w,h,'#637566',vertical?9:18);rect(x,y,w,h,'#E4E7D5',vertical?9:18,color,1.5);
 if(vertical){
  text(x+w/2,y+15,name,7.1,color,700,undefined,'middle');
  circle(x+21,y+39,14,C.paper,color,1.5);circle(x+55,y+39,11,'#363D38',C.paper,1.5);pawn(x+21,y+34,piece,.54);
  actions.forEach(([symbol,label],i)=>{const ax=x+5+i*33,ay=y+64;rect(ax,ay,28,28,i===selected?'#C1DDE0':C.paper,4,i===selected?C.blue:'#ADB8A4',i===selected?2:1);icon(ax+4,ay+4,symbol,20,i===selected?C.blue:brown);text(ax+14,ay+39,label,7,C.ink,600,undefined,'middle')});
  line(x+37,y+54,x+37,y+59,color,1);line(x+19,y+59,x+55,y+59,color,1);line(x+19,y+59,x+19,y+64,color,1);line(x+55,y+59,x+55,y+64,color,1);
  repToken(x+26,y+107,22,tokenIndex);
 }else{
  text(x+12,y+16,name,8.5,color,700);text(x+12,y+29,actions.map(a=>a[1]).join(' / '),7,C.muted);
  circle(x+125,y+22,14,C.paper,color,1.5);circle(x+160,y+22,11,'#363D38',C.paper,1.5);pawn(x+125,y+17,piece,.54);
  line(x+174,y+22,x+182,y+22,color,1);
  actions.forEach(([symbol,label],i)=>{const ax=x+184+i*33;rect(ax,y+6,27,27,i===selected?'#C1DDE0':C.paper,4,i===selected?C.blue:'#ADB8A4');icon(ax+4,y+10,symbol,19,i===selected?C.blue:brown)});
  repToken(x+260,y+7,24,tokenIndex);
 }
 add('</g>');
}
function gallerybuilding(x,y,w,h,color,name){
 room(x,y,w,h,['Галерея Марии','Галерея Льва','Ваша галерея','Галерея Нины'].indexOf(name)+1,name,'',color,[],false);
 // Room labels carry original icons, while large pawns occupy the road action slots.
 rect(x+11,y+34,w-22,24,'#F0ECDD');badge(x+20,y+35,'gallery',20);badge(x+49,y+35,'star',20);badge(x+78,y+35,'staff',20);
}
function influenceTrack(){for(let i=0;i<36;i++){const x=37+i*30.1;rect(x,752,29,24,i%5===0?'#CA6394':C.paper,1,'#B2B8AA');text(x+14,769,i,10,C.ink,500,undefined,'middle');if(i%5===0)icon(x+5,739,'star',17,C.paper)}circle(37+12*30.1+14,752,5,C.blue);circle(37+17*30.1+14,752,5,C.gold);
 const moneyPoints=[[0,0],[1,1],[4,2],[8,3],[12,4],[15,5],[18,6],[20,7],[22,8],[24,9],[26,10],[27,11],[28,12],[29,13],[30,14],[31,15],[32,16],[33,17],[34,18],[35,20]];
 add('<g aria-label="Денежные точки нижней шкалы влияния">');moneyPoints.forEach(([position,value])=>{const x=51+position*30.1;circle(x,784,7.5,visitorBrown,C.paper,1);circle(x,784,5.5,'none','#CBA87A',.6);text(x,786.6,value,7,C.paper,700,undefined,'middle')});add('</g>');
}
function legend(x,y){pawn(x,y,C.blue,.5);text(x+19,y+7,'Галерист',10,C.ink);meeple(x+108,y,C.blue,.55);text(x+124,y+7,'Помощник',10,C.ink);people(x+230,y,[C.paper,visitorBrown,pink],.48);text(x+300,y+7,'Посетители',10,C.ink)}

start(1248);header('Музейный квартал · ваш ход');rect(0,1024,1440,224,C.felt);rect(0,1024,1440,224,'url(#felt)');
rect(24,151,1110,63,'#A0B4A6',4,'#DBE0D0');text(39,174,'ОТКРЫТЫЕ',9,C.dark,700);text(39,190,'ЗАКАЗЫ',10,C.dark,700);
['digital','photo','painting','sculpture'].forEach((n,i)=>{const xx=151+i*219;orderCard(xx,158,58,48,n,['influence','order','staff','order'][i]);text(xx+72,174,['Цифровая иллюстрация','Фотография','Картина','Скульптура'][i],11,C.ink,700);icon(xx+72,183,['influence','order','staff','order'][i],19);text(xx+97,198,['Влияние','Новый заказ','Бесплатный найм','Новый заказ'][i],10,C.dark)});
rect(1039,161,74,43,C.paper,3,'#A3A992');icon(1061,165,'order',29);text(1076,207,'Колода',8,C.dark,400,undefined,'middle');
add('<g transform="translate(0 80)">');
rect(24,150,1110,648,'#D0D4C5',3,'#E5E5D5',3);rect(31,157,1096,586,'#9EADA0',1);rect(31,157,1096,586,'url(#stone)');
market(40,173,235,554);
// Four player galleries, with vestibules facing the public plaza.
rect(284,165,532,569,'#9CA98C',3);rect(284,165,532,569,'url(#paper)');
add('<path d="M550 175V725M288 463H810" fill="none" stroke="#D9DBC6" stroke-width="29"/><path d="M550 175V725M288 463H810" fill="none" stroke="#9DA894" stroke-width="20"/>');
gallerybuilding(299,223,235,165,C.gold,'Галерея Марии');
gallerybuilding(563,223,235,165,purple,'Галерея Льва');
gallerybuilding(299,543,235,165,C.blue,'Ваша галерея');
gallerybuilding(563,543,235,165,C.orange,'Галерея Нины');
vestibule(426,417,C.gold,[pink],'ВЕСТИБЮЛЬ МАРИИ');vestibule(674,417,purple,[visitorBrown,C.paper],'ВЕСТИБЮЛЬ ЛЬВА');
vestibule(426,504,C.blue,[C.paper,visitorBrown,pink],'ВАШ ВЕСТИБЮЛЬ');vestibule(674,504,C.orange,[C.paper],'ВЕСТИБЮЛЬ НИНЫ');
add('<ellipse cx="550" cy="462" rx="68" ry="43" fill="#E4E4D3" stroke="#FCFAED" stroke-width="3"/><ellipse cx="550" cy="462" rx="54" ry="29" fill="#ADBA94"/>');text(550,449,'ПЛОЩАДЬ',8,C.dark,700,undefined,'middle');people(516,471,[C.paper,pink,visitorBrown,C.paper],.48);
[[315,402],[770,402],[315,523],[777,524],[550,268],[550,660]].forEach(([x,y])=>garden(x,y,10));
// Each location is one spatial node: destination, actions and token stay together.
// Short shared connectors tie the north node to orders, and side nodes to their markets.
line(625,134,625,170,'#E5E8D7',7);line(625,134,625,170,'#8EAB9B',2);
line(275,471,282,471,'#E5E8D7',12);line(275,471,282,471,'#71948B',2);
line(822,471,829,471,'#E5E8D7',12);line(822,471,829,471,'#7398A2',2);
locationNode(500,170,'ОТДЕЛ ПРОДАЖ',[['order','Заказ'],['sale','Продажа']],visitorBrown,12,{piece:C.blue});
locationNode(282,410,'МЕЖДУНАР. РЫНОК',[['star','Репутация'],['hammer','Ставка']],'#628B7F',13,{vertical:true,piece:C.gold,selected:1});
locationNode(748,410,'ХУДОЖНИКИ',[['star','Открыть'],['money','Купить']],'#51899C',14,{vertical:true,piece:C.orange});
locationNode(500,708,'МЕДИАЦЕНТР',[['media','Реклама'],['staff','Найм']],'#A16E61',15,{piece:purple,height:39});
// Printed road passes under the influence strip and joins the promotion supply.
line(625,747,625,822,'#E5E8D7',7);line(625,747,625,822,'#A16E61',1.5);
// Genre rows with blue/red artist decks and artwork piles.
text(835,184,'СООБЩЕСТВО ХУДОЖНИКОВ',9,C.dark,700);
const genres=['digital','painting','sculpture','photo'];
const artistNames=[['Э. Валь','А. Ким'],['Л. Орлов','Н. Берг'],['М. Сато','И. Лан'],['А. Норд','М. Ли']];
const artistInitials=[['ЭВ','АК'],['ЛО','НБ'],['МС','ИЛ'],['АН','МЛ']];
for(let i=0;i<4;i++){
 const yy=201+i*130;rect(829,yy,287,122,'#8DAAA4',4,'#CFDBD0');badge(837,yy+10,genres[i],23);
 for(let j=0;j<2;j++){const xx=867+j*82;rect(xx+2,yy+9,74,80,'#526864',3);rect(xx,yy+6,74,80,j?'#BE6672':'#58A4BD',4,'#E8EEE1',2);badge(xx+24,yy+15,genres[i],26);track(xx+4,yy+60,66,4,j+1);text(xx+37,yy+80,artistNames[i][j],7,C.paper,600,undefined,'middle');artistSignatures(xx,yy+96,artistInitials[i][j],j?'#A54F67':C.blue,genres[i])}
 rect(1033,yy+9,74,80,'#526864',3);rect(1031,yy+6,74,80,C.paper,4,'#D9D9C9');art(1038,yy+13,60,43,i);badge(1058,yy+60,genres[i],20);
 text(1068,yy+106,'Подписи ×2',8,C.dark,500,undefined,'middle');
}
influenceTrack();
// Compact action panel and a clear key to piece types.
rect(1150,150,266,648,C.cream,5);text(1170,180,'МЕЖДУНАРОДНЫЙ РЫНОК',9,C.dark,700);title(1170,214,'Ставка: 3 монеты',21);text(1170,240,'Колонка 2 · ряд ставки 3',11,C.muted);actiontiles(1170,263,['hammer','influence','staff']);
text(1170,326,'Из вашего вестибюля',13,C.ink,700);people(1182,359,[C.paper,visitorBrown,pink],.7);text(1170,398,'Все три колонки доступны',11,C.dark,600);text(1170,420,'Учитываются только посетители',10,C.muted);text(1170,437,'вашего вестибюля.',10,C.muted);
line(1170,457,1396,457);text(1170,484,'Награды клетки',11,C.ink,700);influence(1170,498,2);icon(1241,498,'influence',25,pink);text(1274,515,'Награда',10,C.muted);text(1170,550,'Помощник остаётся на рынке.',10,C.muted);
button(1170,574,226,'Подтвердить ход',true);button(1170,626,226,'Выбрать другую клетку');text(1170,708,'ЧЕРНОВИК · НЕ ПОДТВЕРЖДЁН',9,C.muted);
mediaSupply();add('<g transform="translate(0 144)">');
rect(24,802,1392,172,C.cream,4);rect(24,802,8,172,C.blue);text(48,830,'ВАШ ЛИЧНЫЙ ПЛАНШЕТ',10,C.blue,700);title(48,862,'Артём',25);
text(48,883,'РЕПУТАЦИЯ',8,C.dark,700);for(let r=0;r<3;r++)for(let c=0;c<2;c++){let xx=48+c*45,yy=893+r*23;rect(xx,yy,39,21,'#CCD0B5',2,C.line);icon(xx+11,yy+1,[['star','staff'],['money','ticket'],['influence','visitors']][r][c],20)}repToken(51,893,20,4);
text(162,883,'ЗАКАЗЫ',8,C.dark,700);for(let i=0;i<3;i++){let xx=162+i*68;rect(xx,892,58,66,'#CFD1B8',3,C.line);if(i===1)orderCard(xx+6,897,46,56,'digital','influence');else icon(xx+14,908,'order',29,'#F3F0E1')}
text(376,833,'НАЙМ',8,C.dark,700);for(let i=0;i<8;i++){let xx=386+i%2*34,yy=853+Math.floor(i/2)*28;meeple(xx,yy,C.blue,.4);text(xx+13,yy+4,[1,2,2,3,3,4,5,6][i],7,visitorBrown,700)}
rect(477,817,530,142,'url(#parquet)',2);
for(let i=0;i<3;i++){const xx=487+i*170;add(`<path d="M${xx} 928V830L${xx+155} 841V939Z" fill="#F6F0DF" stroke="#B6B6A3"/>`);if(i<2)art(xx+18,850,116,60,i);else badge(xx+61,861,'gallery',29);}
text(1030,832,'ОФИС · ПОМОЩНИКИ',10,C.dark,700);people(1049,870,[C.blue,C.blue],.7);circle(1113,872,12,'none',C.line);circle(1144,872,12,'none',C.line);ticket(1032,918,C.paper,1);ticket(1078,918,visitorBrown,1);ticket(1124,918,pink,2);button(1200,849,192,'Планшет и цели');text(1200,930,'Галерея ≠ вестибюль',10,C.muted);
footer();add('</g></g>');end('01-game-table-v4.svg');

start();header('Репутация и аукцион · детали рынка',true);
market(24,150,580,630,true);
rect(624,150,792,210,C.cream,5);title(647,183,'Доступ по вашему вестибюлю',23);people(661,224,[C.paper,visitorBrown,pink],.8);text(754,226,'Коллекционер · инвестор · знаменитость',12,C.ink,600);
const access=[['Любой 1 посетитель',[C.paper]],['Инвестор + знаменитость',[visitorBrown,pink]],['Коллекционер + один другой',[C.paper,visitorBrown]]];
access.forEach(([label,colors],i)=>{const xx=646+i*251;rect(xx,250,239,88,'#D8DFD1',4,'#BDC8B6');people(xx+22,278,colors,.55);text(xx+84,279,'Колонка '+(i+1),12,C.dark,700);text(xx+12,315,label,10,C.muted)});
rect(624,380,792,400,'#95AAA0',4,'#DFE4D5',2);text(646,407,'ВЫДАЮЩИЕСЯ РАБОТЫ · ФИНАЛЬНЫЙ АУКЦИОН',11,C.paper,700);icon(1367,392,'hammer',29,C.paper);
for(let i=0;i<3;i++){const xx=649+i*253;add(`<path d="M${xx+32} 682L${xx+107.5} 438L${xx+183} 682M${xx+107.5} 444V691" fill="none" stroke="#B29260" stroke-width="9" stroke-linecap="round"/>`);artcard(xx+5,430,205,222,['Тихая геометрия','Золотое сечение','Отражения'][i],[0,2,3][i]);rect(xx-3,648,221,12,'url(#oak)',2);text(xx+107.5,714,'Мольберт '+(i+1),11,C.paper,600,undefined,'middle')}
text(647,752,'Порядок выбора определяется суммой ставок помощников: 1 / 3 / 6.',12,C.paper);
rect(24,802,1392,172,C.cream,4);text(48,830,'ВЫБРАНА ЯЧЕЙКА: КОЛОНКА 2 · СТАВКА 3',10,C.dark,700);title(48,866,'Помощник займёт эту клетку',25);legend(58,925);
rect(510,822,326,128,'#D8DFD1',4);coin(534,850,3);text(558,855,'Оплата: 3 монеты',13,C.ink,700);influence(520,874,2);text(578,893,'Влияние колонки',11,C.muted);icon(520,912,'influence',24,pink);text(558,930,'Награда клетки: INFLUENCE',11,C.ink);
button(870,833,244,'Подтвердить ставку',true);button(1130,833,262,'Вернуться к полю');text(870,909,'Репутация — верхние 4 ряда. Ставки — нижние 3.',11,C.ink);text(870,936,'Данные и раскладка жетонов демонстрационные.',10,C.muted);footer();end('02-market-auction-v4.svg');
// Detailed player board: wall partitions above, six reputation cells and three orders below.
start();header('Личный планшет · Артём',true);
rect(24,151,1392,706,'#E6DEC6',4,'#CDC7AC',3);rect(24,151,1392,706,'url(#paper)',3);rect(24,151,1392,9,C.blue);
text(47,189,'ПЛАНШЕТ ИГРОКА',11,C.blue,700);title(228,190,'Галерея Артёма',27);text(1080,188,'24 монеты   /   12 влияния',15,C.dark,600);
// Queue of eight assistants. Prices are catalog values, not arbitrary counters.
rect(42,211,94,617,'#8C967A',2,'#EFE9D4');icon(74,222,'staff',28,C.paper);const prices=[1,2,2,3,3,4,5,6];
for(let i=0;i<8;i++){const yy=263+i*67;rect(49,yy,80,60,'#B7BA9C',2,'#E2DFCB');meeple(72,yy+31,C.blue,.65);circle(111,yy+13,10,visitorBrown);text(111,yy+17,prices[i],10,C.paper,700,undefined,'middle');if([1,2,5].includes(i))icon(101,yy+29,'ticket',22,i===1?visitorBrown:i===2?pink:C.paper);if(i===3)icon(101,yy+29,'influence',22,pink);if(i===7)icon(101,yy+29,'money',22,visitorBrown)}
// Gallery with four partitions, not isolated generic artwork cards.
rect(154,212,943,307,'url(#parquet)',2,'#BBA66D');text(174,236,'ВЫСТАВЛЕННЫЕ РАБОТЫ',10,C.dark,700);
for(let i=0;i<4;i++){
 const xx=168+i*230;
 add(`<path d="M${xx} 466V254L${xx+213} 277V489Z" fill="#F4EEDF" stroke="#B5B39F" stroke-width="1.6"/><path d="M${xx+213} 277L${xx+221} 270V482L${xx+213} 489Z" fill="#AAAD9B"/><path d="M${xx+6} 259L${xx+209} 281" stroke="#FFFDF3" stroke-width="3"/>`);
 if(i<2){art(xx+28,291,157,118,i);text(xx+107,438,['Тихая геометрия','Красная линия'][i],11,C.ink,600,undefined,'middle');people(xx+95.5,465,[C.paper,visitorBrown],.48)}
 else if(i===2){rect(xx+62,302,88,69,'none',2,'#D0CAB7');repToken(xx+85,403,45,11);text(xx+107,480,'Стартовый жетон',9,C.muted,400,undefined,'middle')}
 else{rect(xx+62,302,88,69,'none',2,'#D0CAB7');badge(xx+90,405,'star',32);text(xx+107,461,'Свободная перегородка',10,C.muted,400,undefined,'middle')}
}
// Office is separate from the player vestibule on the common board.
rect(1115,212,175,307,'#CCCFB8',3,'#B5B89F');text(1133,237,'ОФИС',11,C.dark,700);for(let i=0;i<4;i++){const xx=1155+(i%2)*63,yy=293+Math.floor(i/2)*92;circle(xx,yy,24,'#DFE0C9',C.line);if(i<2)meeple(xx,yy-1,C.blue,1);else icon(xx-14,yy-16,'staff',29,'#BBC1AC')}
text(1203,491,'2 / 4 помощника',10,C.dark,600,undefined,'middle');
// Sale-value track with signature tabs.
rect(1306,212,91,307,'#858268',2,'#DED5B5');text(1352,232,'ПРОДАЖА',9,C.paper,700,undefined,'middle');
[20,17,14,11,8,5,0].forEach((n,i)=>{const yy=245+i*37;rect(1311,yy,81,34,i<3?'#766D4F':'#8E9371',1,'#D2CEAF');circle(1327,yy+16,11,visitorBrown);text(1327,yy+20,n,10,C.paper,600,undefined,'middle');icon(1344,yy+6,'star',22,i<3?C.gold:'#CCCF77');if([1,4].includes(i)){rect(1366,yy+10,23,13,i===1?C.blue:'#A74C5B',6);text(1377,yy+19,i===1?'B':'R',7,C.paper,700,undefined,'middle')}});
// Six empty reputation cells show the reward printed underneath; one is covered by a token.
rect(154,540,355,288,'#9A9E7A',3,'#E6DFCA');text(171,566,'КЛЕТКИ РЕПУТАЦИИ',11,C.paper,700);
const repRewards=[['star','staff'],['money','ticket'],['influence','visitors']];
for(let r=0;r<3;r++)for(let c=0;c<2;c++){const xx=170+c*174, yy=581+r*77;rect(xx,yy,146,63,'#D6D7BE',3,'#F2ECD9');if(r===0&&c===0){repToken(xx+47,yy+5.5,52,4)}else{icon(xx+53,yy+11.5,repRewards[r][c],40,repRewards[r][c]==='influence'?pink:brown);if(r===1&&c===1)text(xx+107,yy+40,'2',17,brown,700)}}
// Three order slots: only one unfinished order is displayed in this sample.
rect(527,540,640,288,'#A4A88C',3,'#E7E0CD');text(545,566,'ЗАКАЗЫ · 1 НЕВЫПОЛНЕННЫЙ',11,C.paper,700);
for(let i=0;i<3;i++){const xx=545+i*208;rect(xx,584,188,221,'#C5C8AE',4,'#E7E5D5');text(xx+14,605,'0'+(i+1),10,C.dark,700);if(i===1){orderCard(xx+24,616,140,172,'digital','influence','Невыполненный заказ');meeple(xx+138,639,C.blue,.72)}else{icon(xx+63,645,'order',62,'#EAECDB');people(xx+82.5,722,[C.paper,C.paper],.55);ticket(xx+77,766,i===0?visitorBrown:C.paper,1)}}
// Personal tickets are stacks, not a table of unrelated resources.
rect(1186,540,211,288,'#AAA789',3,'#E3D9BA');text(1204,566,'БИЛЕТЫ',11,C.paper,700);[pink,visitorBrown,C.paper].forEach((color,i)=>{const yy=589+i*71;for(let j=3;j>=0;j--)rect(1206+j*2,yy+j*3,112,40,color,3,'#B4AE96');icon(1246,yy+4,'ticket',32,color===C.paper?brown:C.paper);text(1355,yy+29,[2,1,1][i],24,color===C.paper?brown:C.paper,700,undefined,'middle')});
// Private goal cards stay face down; no invented scoring text.
rect(24,877,1392,96,C.cream,4);text(48,903,'ЛИЧНЫЕ ЦЕЛИ',10,C.dark,700);rect(220,891,207,64,'#7A8D80',4,'#D2D7C5');icon(234,905,'gallery',35,C.paper);text(286,928,'Куратор · скрыто',13,C.paper,600);rect(447,891,207,64,'#7A8D80',4,'#D2D7C5');icon(461,905,'sale',35,C.paper);text(513,928,'Арт-дилер · скрыто',13,C.paper,600);legend(740,925);footer();end('03-player-board-v4.svg');

const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Галерист — поле и планшет игрока</title><style>body{margin:0;background:#103b3d;color:#f4eedf;font:15px system-ui}header{padding:22px 4vw;position:sticky;top:0;background:#103b3def;z-index:1;display:flex;gap:30px;align-items:center}h1{font-size:19px;margin:0}a{color:#e6cb8f}main{padding:0 4vw 40px}section{margin:18px 0 45px}h2{font-size:17px;font-weight:500}img{width:100%;border-radius:6px;box-shadow:0 15px 50px #0004}p{color:#b6ccc2;line-height:1.6}</style><header><h1>Галерист / Концепт 04</h1><a href="#field">Общее поле</a><a href="#market">Рынок и аукцион</a><a href="#player">Планшет игрока</a></header><main><p>Добавлены четыре открытых заказа с колодой, квадратные жетоны репутации на рынке и у локаций, подробный планшет игрока. Визуальный концепт, данные демонстрационные.</p><section id="field"><h2>01 · Игровое поле · заказы и жетоны репутации</h2><img src="01-game-table-v4.svg" alt="Поле с открытыми заказами, репутацией и вестибюлями"></section><section id="market"><h2>02 · Международный рынок и финальный аукцион</h2><img src="02-market-auction-v4.svg" alt="Рынок с физическими жетонами репутации и область финального аукциона"></section><section id="player"><h2>03 · Планшет игрока · галерея, репутация и заказы</h2><img src="03-player-board-v4.svg" alt="Подробный личный планшет игрока"></section></main></html>`;
fs.writeFileSync(require('path').join(__dirname,'index.html'),html);
console.log('Created v3 field, market / auction, updated index.html');
module.exports={paths,iconBounds};
