import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { analyzeResponseSchema, messageResponseSchema, termNames, type AnalyzeResponse } from '@rental/shared';

type Review = { id:string; keep:boolean; question:string };
const labels: Record<(typeof termNames)[number], string> = {rent_vnd:'Tiền thuê',deposit_vnd:'Tiền cọc',electricity_vnd_per_kwh:'Giá điện',water:'Tiền nước',duration_months:'Thời hạn thuê',notice_days:'Báo trước'};
const samples = [{id:'hd01',title:'01 · Điều khoản bất lợi'},{id:'hd02',title:'02 · Ít rủi ro'},{id:'hd03',title:'03 · Thiếu và mơ hồ'}];
const severityLabels = {high:'Cao',medium:'Trung bình',low:'Thấp'};
const unitLabels:Record<string,string> = {VND:'đồng','VND/kWh':'đồng/kWh',month:'tháng',day:'ngày',text:''};

function Button({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary && styles.secondary,disabled && {opacity:0.45}]}><Text style={[styles.buttonText,secondary && {color:'#164d43'}]}>{title}</Text></Pressable>;
}

export default function App() {
  const [base,setBase] = useState(process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8787');
  const [source,setSource] = useState<'sample'|'upload'>('sample');
  const [sample,setSample] = useState('hd01');
  const [assets,setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [result,setResult] = useState<AnalyzeResponse|null>(null);
  const [reviews,setReviews] = useState<Review[]>([]);
  const [activeFlag,setActiveFlag] = useState<string|null>(null);
  const [pageIndex,setPageIndex] = useState(0);
  const [message,setMessage] = useState('');
  const [address,setAddress] = useState<'em-anh-chi'|'chau-co-chu'>('em-anh-chi');
  const [tone,setTone] = useState<'gentle'|'direct'>('gentle');
  const [imageWidth,setImageWidth] = useState(300);
  const [copied,setCopied] = useState(false);
  const api = base.trim().replace(/\/+$/u,'');
  function reset() { setResult(null);setMessage('');setError('');setReviews([]);setActiveFlag(null);setPageIndex(0);setCopied(false); }
  async function request(route:string, init?:RequestInit) {
    const response = await fetch(`${api}${route}`, {...init,signal:AbortSignal.timeout(240000)});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? `Lỗi HTTP ${response.status}`);
    return body;
  }
  async function pick(camera=false) {
    try {
      let response:ImagePicker.ImagePickerResult;
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Cần quyền camera để chụp ảnh. Bạn vẫn có thể chọn ảnh có sẵn.');
        response = await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:1});
      } else response = await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:3,quality:1});
      if (!response.canceled) {
        reset();setSource('upload');setConfirmed(false);
        setAssets(previous => [...previous,...response.assets].slice(0,3));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Không mở được ảnh.'); }
  }
  async function analyze() {
    reset();setBusy(true);
    try {
      let body:unknown;
      if (source === 'sample') body = await request(`/demo/${sample}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({all_pages_confirmed:confirmed})});
      else {
        const form = new FormData();
        for (const [index,asset] of assets.entries()) {
          if (Platform.OS === 'web') {
            const blob = await (await fetch(asset.uri)).blob();
            form.append('pages',blob,asset.fileName ?? `page-${index}.jpg`);
          } else form.append('pages',{uri:asset.uri,name:asset.fileName ?? `page-${index}.jpg`,type:asset.mimeType ?? 'image/jpeg'} as unknown as Blob);
        }
        form.append('all_pages_confirmed',String(confirmed));
        body = await request('/analyze',{method:'POST',body:form});
      }
      const parsed = analyzeResponseSchema.parse(body);
      setResult(parsed);setReviews(parsed.flags.map(f => ({id:f.id,keep:false,question:f.question_for_landlord})));
    } catch (e) { setError(e instanceof Error ? e.message : 'Không kết nối được. Kiểm tra địa chỉ API và mạng.'); }
    finally { setBusy(false); }
  }
  function updateReview(index:number, patch:Partial<Review>) {
    setReviews(current => current.map((r,i) => i === index ? {...r,...patch} : r));setMessage('');setCopied(false);
  }
  async function createMessage() {
    setBusy(true);setError('');setCopied(false);
    try {
      const body = messageResponseSchema.parse(await request('/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewed_flags:reviews,address,tone})}));
      setMessage(body.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không soạn được tin.'); }
    finally {setBusy(false);}
  }
  const page = result?.pages[pageIndex];
  const flag = result?.flags.find(f => f.id === activeFlag);
  const highlighted = flag?.evidence_status === 'verified' ? page?.lines.filter(l => flag.line_ids.includes(l.id)) ?? [] : [];
  const image = result?.mode === 'replay' ? `${api}/samples/${result.sample_id}.png` : assets[pageIndex]?.uri;

  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>BẢN THỬ NGHIỆM · HỢP ĐỒNG THUÊ TRỌ</Text>
    <Text style={styles.heading}>Hiểu rõ trước khi ký</Text>
    <Text style={styles.muted}>Đọc thông tin, xem điểm cần hỏi và chuẩn bị tin nhắn cho chủ nhà. Kết quả hỗ trợ tham khảo, không phải tư vấn pháp lý.</Text>
    <View style={styles.card}>
      <Text style={styles.title}>1. Chọn hợp đồng</Text>
      <Text style={styles.label}>Địa chỉ API</Text>
      <TextInput accessibilityLabel="Địa chỉ API" editable={!busy} autoCapitalize="none" value={base} onChangeText={text=>{setBase(text);reset();}} style={styles.input}/>
      <Text style={styles.small}>Điện thoại thật: nhập http://IP-máy-tính:8787, dùng cùng mạng Wi-Fi.</Text>
      <View style={styles.row}><Button disabled={busy} title="Thử dữ liệu mẫu" secondary={source!=='sample'} onPress={()=>{reset();setSource('sample');setConfirmed(false);}}/><Button disabled={busy} title="Ảnh của bạn" secondary={source!=='upload'} onPress={()=>{reset();setSource('upload');setConfirmed(false);}}/></View>
      {source === 'sample' ? <>
        <Text style={styles.note}>Ba hợp đồng mô phỏng, với OCR và kết quả AI soạn sẵn. Chế độ này dùng để thử thao tác và kiểm tra pipeline.</Text>
        {samples.map(s=><Button key={s.id} disabled={busy} title={s.title} secondary={sample!==s.id} onPress={()=>{reset();setSample(s.id);setConfirmed(false);}}/>)}
      </> : <>
        <Text style={styles.note}>Ảnh được gửi đến backend và dịch vụ OCR/AI khi API chạy live. Tối đa 3 ảnh JPEG/PNG, mỗi ảnh 5 MB.</Text>
        <View style={styles.row}><Button disabled={busy||assets.length>=3} title="Chọn ảnh" onPress={()=>void pick()}/><Button disabled={busy||assets.length>=3} title="Chụp ảnh" secondary onPress={()=>void pick(true)}/></View>
        {assets.map((a,i)=><View key={`${a.uri}-${i}`} style={styles.row}><Image source={{uri:a.uri}} style={{width:60,height:80}}/><Text>Trang {i+1}</Text><Button disabled={busy} title="↑" secondary onPress={()=>{if(i===0)return;setAssets(current=>{const next=[...current];[next[i-1],next[i]]=[next[i],next[i-1]];return next;});reset();setConfirmed(false);}}/><Button disabled={busy} title="Xóa" secondary onPress={()=>{setAssets(v=>v.filter((_,j)=>j!==i));reset();setConfirmed(false);}}/></View>)}
      </>}
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed}} disabled={busy} onPress={()=>{setConfirmed(!confirmed);reset();}} style={styles.checkbox}><Text>{confirmed?'☑':'☐'} Tôi đã chọn đủ các trang và phụ lục liên quan.</Text></Pressable>
      <Button title="Phân tích hợp đồng" disabled={busy||(source==='upload'&&!assets.length)} onPress={()=>void analyze()}/>
    </View>
    {busy&&<View style={styles.row}><ActivityIndicator color="#126554"/><Text>Đang xử lý, vui lòng chờ…</Text></View>}
    {!!error&&<View style={styles.error}><Text accessibilityRole="alert">{error}</Text></View>}
    {result&&<>
      <View style={styles.card}>
        <Text style={styles.title}>2. Thông tin đọc được</Text>
        <Text style={styles.eyebrow}>{result.mode==='replay'?'DỮ LIỆU MÔ PHỎNG':'KẾT QUẢ OCR + AI THẬT'}</Text>
        {result.warnings.map((w,i)=><Text key={i} style={styles.note}>{w}</Text>)}
        {termNames.map(key=>{const t=result.extraction.key_terms[key];return <View key={key} style={styles.term}><Text>{labels[key]}</Text><Text style={{fontWeight:'600',flex:1,textAlign:'right'}}>{t.status==='found'&&t.value!==null?`${typeof t.value==='number'?t.value.toLocaleString('vi-VN'):t.value} ${unitLabels[t.unit]??t.unit}`:t.status==='unclear'?'Cần kiểm tra lại':'Chưa tìm thấy'}</Text></View>;})}
        {result.calculations.deposit_months!==null&&<Text style={styles.muted}>Tiền cọc tương đương {result.calculations.deposit_months} tháng tiền thuê. Chưa có đánh giá cao/thấp theo thị trường.</Text>}
        <Text style={styles.small}>{result.flags.length} điểm cần xem trong phạm vi kiểm tra hiện tại.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>3. Xem và duyệt từng cảnh báo</Text>
        {!result.flags.length&&<Text style={styles.muted}>Chưa phát hiện vấn đề trong 8 quy tắc đang kiểm tra. Kết quả này không xác nhận toàn bộ hợp đồng an toàn.</Text>}
        {result.flags.map((f,i)=><View key={f.id} style={styles.flag}>
          <Text style={styles.eyebrow}>{f.rule_id} · Mức {severityLabels[f.severity]} · {f.type==='missing'?'Thiếu điều khoản':f.type==='unclear'?'Mơ hồ':'Có rủi ro'}</Text>
          <Text style={styles.title}>{f.title}</Text><Text style={styles.body}>{f.explanation}</Text>
          {!!f.quote&&<Text style={styles.quote}>“{f.quote}”</Text>}
          <Text style={styles.small}>{f.evidence_reason}</Text>
          {f.evidence_status==='verified'&&<Button disabled={busy} title="Xem dòng trên ảnh" secondary onPress={()=>{setActiveFlag(f.id);setPageIndex(result.pages.findIndex(p=>p.lines.some(l=>f.line_ids.includes(l.id))));}}/>}
          <Text style={styles.label}>Câu hỏi gửi chủ nhà — bạn có thể sửa</Text>
          <TextInput accessibilityLabel={`Câu hỏi ${f.id}`} editable={!busy} multiline value={reviews[i]?.question??''} onChangeText={question=>updateReview(i,{question})} style={styles.input}/>
          <Button disabled={busy} title={reviews[i]?.keep?'✓ Đã giữ · Bấm để bỏ':'Giữ câu hỏi này'} secondary={!reviews[i]?.keep} onPress={()=>updateReview(i,{keep:!reviews[i]?.keep})}/>
        </View>)}
        {page&&<>
          <Text style={styles.label}>Ảnh đối chiếu · Trang {pageIndex+1}/{result.pages.length}</Text>
          <View style={styles.row}>{result.pages.map((p,i)=><Button key={p.id} title={`Trang ${i+1}`} secondary={pageIndex!==i} onPress={()=>setPageIndex(i)}/>)}</View>
          <View onLayout={event=>setImageWidth(event.nativeEvent.layout.width)} style={{width:'100%',height:imageWidth*page.height/page.width,backgroundColor:'#eee'}}>
            <Image source={{uri:image}} style={StyleSheet.absoluteFill} resizeMode="contain"/>
            {highlighted.map(l=>{const xs=l.polygon.map(p=>p.x),ys=l.polygon.map(p=>p.y);return <View key={l.id} pointerEvents="none" style={{position:'absolute',left:Math.min(...xs)*imageWidth,top:Math.min(...ys)*imageWidth*page.height/page.width,width:(Math.max(...xs)-Math.min(...xs))*imageWidth,height:(Math.max(...ys)-Math.min(...ys))*imageWidth*page.height/page.width,backgroundColor:'#ffc40055',borderWidth:1,borderColor:'#b07500'}}/>;})}
          </View>
          {flag&&<Text style={styles.small}>Đang xem: {flag.title}</Text>}
        </>}
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>4. Chuẩn bị tin nhắn</Text><Text style={styles.muted}>Đã giữ {reviews.filter(r=>r.keep).length} câu hỏi. Tin nhắn mẫu chỉ ghép những câu bạn chọn, giữ nguyên phần chỉnh sửa.</Text>
        <View style={styles.row}><Button disabled={busy} title={address==='em-anh-chi'?'Xưng hô: em – anh/chị':'Xưng hô: cháu – cô/chú'} secondary onPress={()=>{setAddress(address==='em-anh-chi'?'chau-co-chu':'em-anh-chi');setMessage('');}}/><Button disabled={busy} title={tone==='gentle'?'Giọng: nhẹ nhàng':'Giọng: thẳng thắn'} secondary onPress={()=>{setTone(tone==='gentle'?'direct':'gentle');setMessage('');}}/></View>
        <Button title="Tạo tin nhắn từ câu hỏi đã giữ" disabled={busy||!reviews.some(r=>r.keep)||reviews.some(r=>r.keep&&!r.question.trim())} onPress={()=>void createMessage()}/>
        {!!message&&<><Text selectable style={styles.quote}>{message}</Text><Button title={copied?'Đã sao chép':'Sao chép tin nhắn'} onPress={()=>{void Clipboard.setStringAsync(message).then(()=>setCopied(true)).catch(()=>setError('Không sao chép được; hãy chọn nội dung tin nhắn để sao chép thủ công.'));}}/></>}
      </View>
    </>}
    <Text style={styles.small}>Bản thử nghiệm chưa lưu lịch sử. Bạn tự xem lại và gửi tin nhắn.</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#f1f5f0'},content:{padding:20,paddingTop:36,gap:18,maxWidth:820,width:'100%',alignSelf:'center'},
  eyebrow:{fontSize:11,fontWeight:'700',letterSpacing:1,color:'#356754'},heading:{fontSize:32,fontWeight:'800',color:'#183d32'},
  title:{fontSize:18,fontWeight:'700',color:'#173c32',marginBottom:6},muted:{fontSize:14,color:'#53635a',lineHeight:22},body:{fontSize:15,lineHeight:23,color:'#26392f'},
  card:{backgroundColor:'#fff',borderRadius:18,padding:18,gap:10,borderWidth:1,borderColor:'#dce6dc'},
  label:{fontSize:13,fontWeight:'600',color:'#42594b'},small:{fontSize:12,color:'#627164',lineHeight:18},
  input:{borderWidth:1,borderColor:'#b7cabc',borderRadius:10,padding:12,fontSize:14,color:'#183d32',backgroundColor:'#fcfdfb'},
  button:{backgroundColor:'#19634e',borderRadius:10,paddingHorizontal:14,paddingVertical:12,alignItems:'center',marginVertical:2},
  secondary:{backgroundColor:'#e9f1e7'},buttonText:{color:'#fff',fontWeight:'600',fontSize:13},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},
  checkbox:{paddingVertical:12},note:{backgroundColor:'#fff3d8',padding:12,borderRadius:8,fontSize:13,lineHeight:20,color:'#78561a'},
  error:{backgroundColor:'#ffe8df',padding:16,borderRadius:10},term:{flexDirection:'row',gap:18,paddingVertical:8,borderBottomWidth:1,borderColor:'#eff2ed'},
  flag:{borderTopWidth:1,borderColor:'#dce6dc',paddingVertical:16,gap:10},quote:{padding:14,backgroundColor:'#f0f5ee',borderRadius:8,fontSize:14,lineHeight:22,color:'#314438'},
});
