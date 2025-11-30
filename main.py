import os
import random
import string
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
import requests
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from authlib.integrations.starlette_client import OAuth
from fastapi.staticfiles import StaticFiles

load_dotenv()

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

app = FastAPI()

app.add_middleware(
    SessionMiddleware, 
    secret_key=os.getenv("SECRET_KEY"),
    https_only=False,     
    same_site="lax",      
    max_age=3600          
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_path = os.path.join(current_dir, "frontend")

if os.path.isdir(frontend_path):
    app.mount("/uygulama", StaticFiles(directory=frontend_path, html=True), name="frontend")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
TMDB_API_KEY = os.getenv("TMDB_API_KEY") 
BASE_URL = "https://api.themoviedb.org/3"

oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# --- VERİTABANI ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./film_arsivi.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserDB(Base):
    __tablename__ = "kullanicilar"
    email = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    name = Column(String)
    picture = Column(String)
    join_date = Column(DateTime, default=datetime.utcnow)

class FriendshipDB(Base):
    __tablename__ = "arkadasliklar"
    id = Column(Integer, primary_key=True, index=True)
    follower_email = Column(String, ForeignKey("kullanicilar.email")) # İstek Gönderen
    followed_email = Column(String, ForeignKey("kullanicilar.email")) # İstek Alan
    status = Column(String, default="pending") # pending (bekliyor) veya accepted (kabul)
    created_at = Column(DateTime, default=datetime.utcnow)

class FilmDB(Base):
    __tablename__ = "izlenecekler"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, ForeignKey("kullanicilar.email"))
    tmdb_id = Column(Integer)
    tur = Column(String) 
    ad = Column(String)
    puan = Column(Float)
    poster = Column(String)
    izlendi = Column(String, default="Hayır")
    kisisel_puan = Column(Integer, default=0)
    kisisel_yorum = Column(String, default="")
    eklenme_tarihi = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# --- MODELLER ---
class FilmEkle(BaseModel):
    tmdb_id: int
    tur: str
    ad: str
    puan: float
    poster: str = None

class DurumGuncelle(BaseModel):
    izlendi: str = None
    kisisel_puan: int = None
    kisisel_yorum: str = None

class ArkadasEkleModel(BaseModel):
    username: str

class IstekYanitlaModel(BaseModel):
    istek_id: int
    durum: str # 'kabul' veya 'red'

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(request: Request):
    user = request.session.get('user')
    if not user:
        raise HTTPException(status_code=401, detail="Oturum bulunamadı.")
    return user

def generate_username(name):
    base = name.lower().replace(" ", "")
    tr_map = str.maketrans("çğıöşü", "cgiosu")
    base = base.translate(tr_map)
    suffix = ''.join(random.choices(string.digits, k=4))
    return f"{base}{suffix}"

def veri_isle(results, tur_tipi):
    icerikler = []
    for item in results:
        baslik = item.get("title") or item.get("name")
        puan = item.get("vote_average", 0)
        icerikler.append({
            "tmdb_id": item["id"],
            "ad": baslik,
            "puan": puan,
            "tur": "Dizi" if tur_tipi == "tv" else "Film",
            "poster": f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
        })
    return icerikler

# --- ENDPOINTLER ---

@app.get("/")
def read_root():
    return RedirectResponse(url="/uygulama/index.html")

@app.get("/auth/login")
async def login(request: Request):
    redirect_uri = str(request.url_for('auth_google'))
    if "onrender.com" in redirect_uri:
        redirect_uri = redirect_uri.replace("http://", "https://")
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/google/callback")
async def auth_google(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get('userinfo')
        if user_info:
            request.session['user'] = dict(user_info)
            db_user = db.query(UserDB).filter(UserDB.email == user_info['email']).first()
            if not db_user:
                new_username = generate_username(user_info['name'])
                while db.query(UserDB).filter(UserDB.username == new_username).first():
                    new_username = generate_username(user_info['name'])
                new_user = UserDB(email=user_info['email'], username=new_username, name=user_info['name'], picture=user_info['picture'])
                db.add(new_user)
            else:
                db_user.name = user_info['name']
                db_user.picture = user_info['picture']
                if not db_user.username: db_user.username = generate_username(user_info['name'])
            db.commit()
            if db_user: request.session['user']['username'] = db_user.username
        return RedirectResponse(url="/uygulama/index.html")
    except Exception as e:
        return JSONResponse(content={"error": "Giriş Hatası", "detay": str(e)}, status_code=500)

@app.get("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"mesaj": "Çıkış yapıldı"}

@app.get("/user_info")
def user_info(request: Request, db: Session = Depends(get_db)):
    user = request.session.get('user')
    if user:
        db_user = db.query(UserDB).filter(UserDB.email == user['email']).first()
        if db_user: return {"email": db_user.email, "name": db_user.name, "picture": db_user.picture, "username": db_user.username}
    return None

# --- ARKADAŞLIK SİSTEMİ (GÜNCELLENDİ) ---

@app.get("/kullanici/ara/{query}")
def kullanici_ara(query: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    sonuclar = db.query(UserDB).filter(UserDB.username.contains(query), UserDB.email != user['email']).limit(5).all()
    return {"sonuclar": [{"username": u.username, "name": u.name, "picture": u.picture} for u in sonuclar]}

@app.post("/arkadas/istek-gonder")
def istek_gonder(veri: ArkadasEkleModel, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    arkadas = db.query(UserDB).filter(UserDB.username == veri.username).first()
    
    if not arkadas: return {"durum": "hata", "mesaj": "Kullanıcı bulunamadı."}
    if user['email'] == arkadas.email: return {"durum": "hata", "mesaj": "Kendini ekleyemezsin."}

    # Zaten bir ilişki veya istek var mı?
    mevcut = db.query(FriendshipDB).filter(
        ((FriendshipDB.follower_email == user['email']) & (FriendshipDB.followed_email == arkadas.email)) |
        ((FriendshipDB.follower_email == arkadas.email) & (FriendshipDB.followed_email == user['email']))
    ).first()
    
    if mevcut:
        if mevcut.status == "accepted": return {"durum": "hata", "mesaj": "Zaten arkadaşsınız."}
        return {"durum": "hata", "mesaj": "Zaten bekleyen bir istek var."}

    # İsteği oluştur (status='pending')
    yeni_istek = FriendshipDB(follower_email=user['email'], followed_email=arkadas.email, status="pending")
    db.add(yeni_istek)
    db.commit()
    return {"durum": "basarili", "mesaj": f"@{arkadas.username} kullanıcısına istek gönderildi."}

@app.get("/arkadas/gelen-istekler")
def gelen_istekler(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    # Bana (followed_email) gelen ve durumu 'pending' olanlar
    istekler = db.query(FriendshipDB, UserDB).join(UserDB, FriendshipDB.follower_email == UserDB.email)\
        .filter(FriendshipDB.followed_email == user['email'], FriendshipDB.status == "pending").all()
    
    return {"istekler": [{"id": f.id, "username": u.username, "name": u.name, "picture": u.picture} for f, u in istekler]}

@app.post("/arkadas/yanitla")
def istek_yanitla(veri: IstekYanitlaModel, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    istek = db.query(FriendshipDB).filter(FriendshipDB.id == veri.istek_id, FriendshipDB.followed_email == user['email']).first()
    
    if not istek: return {"durum": "hata", "mesaj": "İstek bulunamadı."}
    
    if veri.durum == "kabul":
        istek.status = "accepted"
        # KARŞILIKLI OLMASI İÇİN: Ters kaydı da oluşturuyoruz (Ben de onu takip ediyorum)
        ters_kayit = FriendshipDB(follower_email=user['email'], followed_email=istek.follower_email, status="accepted")
        db.add(ters_kayit)
        db.commit()
        return {"durum": "basarili", "mesaj": "Arkadaşlık kabul edildi!"}
    else:
        db.delete(istek)
        db.commit()
        return {"durum": "basarili", "mesaj": "İstek reddedildi."}

@app.get("/arkadaslarim")
def arkadaslari_getir(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    # Sadece KABUL EDİLMİŞ (accepted) olanları getir
    arkadaslar = db.query(UserDB).join(FriendshipDB, UserDB.email == FriendshipDB.followed_email)\
        .filter(FriendshipDB.follower_email == user['email'], FriendshipDB.status == "accepted").all()
    return {"arkadaslar": [{"username": u.username, "name": u.name, "picture": u.picture} for u in arkadaslar]}

@app.get("/arkadas/akis")
def arkadas_aktiviteleri(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    # Sadece kabul edilmiş arkadaşları al
    arkadaslar = db.query(FriendshipDB.followed_email).filter(FriendshipDB.follower_email == user['email'], FriendshipDB.status == "accepted").all()
    arkadas_listesi = [t[0] for t in arkadaslar]
    
    if not arkadas_listesi: return {"aktiviteler": []}

    aktiviteler = db.query(FilmDB, UserDB).join(UserDB, FilmDB.user_email == UserDB.email)\
        .filter(FilmDB.user_email.in_(arkadas_listesi), FilmDB.izlendi == "Evet")\
        .order_by(FilmDB.eklenme_tarihi.desc()).limit(20).all()
        
    return {"aktiviteler": [{
        "arkadas_adi": u.name, 
        "arkadas_username": u.username,
        "arkadas_foto": u.picture, 
        "film_adi": f.ad, 
        "film_poster": f.poster, 
        "puan": f.kisisel_puan, 
        "yorum": f.kisisel_yorum
    } for f, u in aktiviteler]}

# --- DİĞER ENDPOINTLER (Search, Detay, Ekle vb.) ---
# (Buradan aşağısı öncekiyle aynı)

@app.get("/search/{icerik_adi}")
def search_content(icerik_adi: str, tur: str = "movie", sirala: str = "yok"):
    if not TMDB_API_KEY: return {"sonuc": []}
    endpoint = f"{BASE_URL}/search/{tur}"
    params = {"api_key": TMDB_API_KEY, "query": icerik_adi, "language": "tr-TR"}
    try: data = requests.get(endpoint, params=params).json()
    except: return {"sonuc": []}
    if not data.get("results"): return {"sonuc": []}
    icerikler = veri_isle(data["results"], tur)
    if sirala == "puan_azalan": icerikler = sorted(icerikler, key=lambda x: x['puan'], reverse=True)
    elif sirala == "puan_artan": icerikler = sorted(icerikler, key=lambda x: x['puan'], reverse=False)
    return {"sonuc": icerikler}

@app.get("/detay/{tmdb_id}")
def film_detay(tmdb_id: int, tur: str = "movie"):
    endpoint = f"{BASE_URL}/{tur}/{tmdb_id}"
    params = {"api_key": TMDB_API_KEY, "language": "tr-TR", "append_to_response": "videos,watch/providers,credits,external_ids"}
    data = requests.get(endpoint, params=params).json()
    
    baslik = data.get("title") or data.get("name") 
    sure = data.get("runtime") 
    if not sure and data.get("episode_run_time"): sure = data["episode_run_time"][0]
    
    yonetmen = "Bilinmiyor"
    if "credits" in data:
        for kisi in data["credits"].get("crew", []):
            if kisi["job"] == "Director": yonetmen = kisi["name"]; break
        if tur == "tv" and data.get("created_by"): yonetmen = data["created_by"][0]["name"]

    oyuncular = [o["name"] for o in data["credits"].get("cast", [])[:5]]
    turler = [t["name"] for t in data.get("genres", [])]
    video_key = None
    if "videos" in data and "results" in data["videos"]:
        for video in data["videos"]["results"]:
            if video["site"] == "YouTube" and video["type"] == "Trailer": video_key = video["key"]; break
    
    platformlar = []
    if "watch/providers" in data and "results" in data["watch/providers"]:
        tr_data = data["watch/providers"]["results"].get("TR")
        if tr_data and "flatrate" in tr_data:
            for p in tr_data["flatrate"]: platformlar.append({"ad": p["provider_name"], "logo": f"https://image.tmdb.org/t/p/original{p['logo_path']}"})

    return {"baslik": baslik, "ozet": data.get("overview"), "tagline": data.get("tagline"), "sure": sure, "puan": data.get("vote_average"), "poster": f"https://image.tmdb.org/t/p/w500{data['poster_path']}" if data.get('poster_path') else None, "backdrop": f"https://image.tmdb.org/t/p/original{data['backdrop_path']}" if data.get('backdrop_path') else None, "youtube_video": f"https://www.youtube.com/embed/{video_key}" if video_key else None, "platformlar": platformlar, "yonetmen": yonetmen, "oyuncular": oyuncular, "turler": turler, "imdb_id": data.get("external_ids", {}).get("imdb_id")}

@app.post("/ekle")
def filme_ekle(film: FilmEkle, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    mevcut = db.query(FilmDB).filter(FilmDB.user_email == user['email'], FilmDB.tmdb_id == film.tmdb_id, FilmDB.tur == film.tur).first()
    if mevcut: return {"mesaj": "Zaten ekli"}
    yeni = FilmDB(user_email=user['email'], tmdb_id=film.tmdb_id, tur=film.tur, ad=film.ad, puan=film.puan, poster=film.poster, izlendi="Hayır")
    db.add(yeni); db.commit()
    return {"mesaj": "Eklendi"}

@app.get("/listem")
def listemi_getir(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    return {"listem": db.query(FilmDB).filter(FilmDB.user_email == user['email']).all()}

@app.delete("/sil/{film_id}")
def film_sil(film_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    db.query(FilmDB).filter(FilmDB.id == film_id, FilmDB.user_email == user['email']).delete()
    db.commit()
    return {"mesaj": "Silindi"}

@app.put("/guncelle/{film_id}")
def durum_guncelle(film_id: int, veri: DurumGuncelle, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    film = db.query(FilmDB).filter(FilmDB.id == film_id, FilmDB.user_email == user['email']).first()
    if not film: raise HTTPException(status_code=404, detail="Film bulunamadı")
    if veri.izlendi: film.izlendi = veri.izlendi
    if veri.kisisel_puan is not None: film.kisisel_puan = veri.kisisel_puan
    if veri.kisisel_yorum is not None: film.kisisel_yorum = veri.kisisel_yorum
    db.commit()
    return {"mesaj": "Güncellendi"}

@app.get("/oneriler")
def get_recommendations(request: Request, db: Session = Depends(get_db)):
    user = request.session.get('user')
    if not user:
        res = requests.get(f"{BASE_URL}/movie/popular?api_key={TMDB_API_KEY}&language=tr-TR").json()
        return {"baslik": "🔥 Popüler Filmler", "sonuc": veri_isle(res.get("results", []), "movie")}
    kullanici_filmleri = db.query(FilmDB).filter(FilmDB.user_email == user['email']).all()
    if not kullanici_filmleri:
        res = requests.get(f"{BASE_URL}/movie/popular?api_key={TMDB_API_KEY}&language=tr-TR").json()
        return {"baslik": "🔥 Popüler Filmler (Listen Boş)", "sonuc": veri_isle(res.get("results", []), "movie")}
    secilen = random.choice(kullanici_filmleri)
    endpoint_tur = "movie" if secilen.tur == "movie" else "tv"
    res = requests.get(f"{BASE_URL}/{endpoint_tur}/{secilen.tmdb_id}/recommendations?api_key={TMDB_API_KEY}&language=tr-TR").json()
    if not res.get("results"):
        res = requests.get(f"{BASE_URL}/movie/popular?api_key={TMDB_API_KEY}&language=tr-TR").json()
        return {"baslik": "🔥 Popüler Filmler", "sonuc": veri_isle(res.get("results", []), "movie")}
    return {"baslik": f"Çünkü '{secilen.ad}' izledin...", "sonuc": veri_isle(res.get("results", []), endpoint_tur)}

# --- ARKADAŞ PROFİLİ VE UYUM HESAPLAMA ---
@app.get("/kullanici-profil/{target_username}")
def get_public_profile(target_username: str, request: Request, db: Session = Depends(get_db)):
    current_user = request.session.get('user') # Sen
    
    # 1. Hedef kullanıcıyı bul
    target_user_db = db.query(UserDB).filter(UserDB.username == target_username).first()
    if not target_user_db:
        return {"durum": "hata", "mesaj": "Kullanıcı bulunamadı"}

    # 2. Hedefin filmlerini çek
    target_films = db.query(FilmDB).filter(FilmDB.user_email == target_user_db.email).all()
    
    # 3. İstatistikler
    izlenen_sayisi = len([f for f in target_films if f.izlendi == "Evet"])
    izlenecek_sayisi = len(target_films) - izlenen_sayisi
    
    film_sayisi = len([f for f in target_films if f.izlendi == "Evet" and f.tur == "movie"])
    dizi_sayisi = len([f for f in target_films if f.izlendi == "Evet" and f.tur == "tv"])
    favori = "Henüz Yok"
    if film_sayisi > dizi_sayisi: favori = "🎬 Filmci"
    elif dizi_sayisi > film_sayisi: favori = "📺 Dizici"
    elif izlenen_sayisi > 0: favori = "⚖️ Dengeli"

    # 4. UYUM SKORU HESAPLAMA (MATCH)
    match_score = 0
    ortak_filmler = []
    
    if current_user:
        # Senin filmlerini çek
        my_films = db.query(FilmDB).filter(FilmDB.user_email == current_user['email']).all()
        
        # TMDB ID'lerine göre kümeler oluştur
        my_ids = set([f.tmdb_id for f in my_films])
        target_ids = set([f.tmdb_id for f in target_films])
        
        # Kesişim (Ortak olanlar)
        common_ids = my_ids.intersection(target_ids)
        
        # Basit Jaccard Benzerliği (Ortak / Toplam Eşsiz) * 100
        union_ids = my_ids.union(target_ids)
        if len(union_ids) > 0:
            match_score = int((len(common_ids) / len(union_ids)) * 100)
            
        # Ortak filmlerin isimlerini de alalım (Detay göstermek istersen)
        ortak_filmler = len(common_ids)

    # 5. Listeyi Hazırla
    film_listesi = []
    for f in target_films:
        film_listesi.append({
            "tmdb_id": f.tmdb_id,
            "tur": f.tur,
            "ad": f.ad,
            "puan": f.puan,
            "poster": f.poster,
            "izlendi": f.izlendi,
            "kisisel_puan": f.kisisel_puan,
            "kisisel_yorum": f.kisisel_yorum
        })

    return {
        "user": {
            "name": target_user_db.name,
            "picture": target_user_db.picture,
            "username": target_user_db.username
        },
        "stats": {
            "watched": izlenen_sayisi,
            "pending": izlenecek_sayisi,
            "type": favori
        },
        "match": {
            "score": match_score,
            "common_count": ortak_filmler
        },
        "list": film_listesi
    }