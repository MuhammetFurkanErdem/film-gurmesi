import os
import random
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
from sqlalchemy.orm import sessionmaker, Session, relationship
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

# --- VERİTABANI GÜNCELLEMESİ ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./film_arsivi.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 1. KULLANICI TABLOSU (YENİ)
class UserDB(Base):
    __tablename__ = "kullanicilar"
    email = Column(String, primary_key=True, index=True)
    name = Column(String)
    picture = Column(String)
    join_date = Column(DateTime, default=datetime.utcnow)
    is_profile_public = Column(Boolean, default=True) # İleride gizlilik için

# 2. ARKADAŞLIK TABLOSU (YENİ)
class FriendshipDB(Base):
    __tablename__ = "arkadasliklar"
    id = Column(Integer, primary_key=True, index=True)
    follower_email = Column(String, ForeignKey("kullanicilar.email")) # Takip Eden
    followed_email = Column(String, ForeignKey("kullanicilar.email")) # Takip Edilen
    created_at = Column(DateTime, default=datetime.utcnow)

# 3. FİLM TABLOSU (GÜNCELLENDİ - User İlişkisi Eklenebilir ama şimdilik email yeterli)
class FilmDB(Base):
    __tablename__ = "izlenecekler"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, ForeignKey("kullanicilar.email")) # İlişkilendirdik
    tmdb_id = Column(Integer)
    tur = Column(String) 
    ad = Column(String)
    puan = Column(Float)
    poster = Column(String)
    izlendi = Column(String, default="Hayır")
    kisisel_puan = Column(Integer, default=0)
    kisisel_yorum = Column(String, default="")
    eklenme_tarihi = Column(DateTime, default=datetime.utcnow) # Yeni: Ne zaman ekledi?

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
    arkadas_email: str

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
            
            # --- KULLANICIYI VERİTABANINA KAYDET/GÜNCELLE ---
            db_user = db.query(UserDB).filter(UserDB.email == user_info['email']).first()
            if not db_user:
                new_user = UserDB(
                    email=user_info['email'],
                    name=user_info['name'],
                    picture=user_info['picture']
                )
                db.add(new_user)
            else:
                # Profil fotosu veya ismi değişmişse güncelle
                db_user.name = user_info['name']
                db_user.picture = user_info['picture']
            db.commit()
            # ------------------------------------------------

        return RedirectResponse(url="/uygulama/index.html")
    except Exception as e:
        return JSONResponse(content={"error": "Giriş Hatası", "detay": str(e)}, status_code=500)

@app.get("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"mesaj": "Çıkış yapıldı"}

@app.get("/user_info")
def user_info(request: Request):
    return request.session.get('user')

# --- ARKADAŞLIK SİSTEMİ ENDPOINTLERİ ---

@app.post("/arkadas/ekle")
def arkadas_ekle(veri: ArkadasEkleModel, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    
    # 1. Kendini ekleyemez
    if user['email'] == veri.arkadas_email:
        return {"durum": "hata", "mesaj": "Kendini ekleyemezsin."}

    # 2. Arkadaş veritabanında var mı?
    arkadas = db.query(UserDB).filter(UserDB.email == veri.arkadas_email).first()
    if not arkadas:
        return {"durum": "hata", "mesaj": "Bu e-posta adresine sahip bir kullanıcı bulunamadı."}

    # 3. Zaten ekli mi?
    mevcut = db.query(FriendshipDB).filter(
        FriendshipDB.follower_email == user['email'],
        FriendshipDB.followed_email == veri.arkadas_email
    ).first()
    
    if mevcut:
        return {"durum": "hata", "mesaj": "Zaten takip ediyorsun."}

    # 4. Ekle
    yeni_arkadaslik = FriendshipDB(follower_email=user['email'], followed_email=veri.arkadas_email)
    db.add(yeni_arkadaslik)
    db.commit()
    
    return {"durum": "basarili", "mesaj": f"{arkadas.name} takip edildi!"}

@app.get("/arkadas/akis")
def arkadas_aktiviteleri(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    
    # 1. Takip ettiğim kişilerin e-postalarını bul
    takip_ettiklerim = db.query(FriendshipDB.followed_email).filter(FriendshipDB.follower_email == user['email']).all()
    takip_listesi = [t[0] for t in takip_ettiklerim]
    
    if not takip_listesi:
        return {"aktiviteler": []}

    # 2. Bu kişilerin izlediği ve yorum yaptığı filmleri getir (En son eklenen en üstte)
    aktiviteler = db.query(FilmDB, UserDB).join(UserDB, FilmDB.user_email == UserDB.email)\
        .filter(FilmDB.user_email.in_(takip_listesi), FilmDB.izlendi == "Evet")\
        .order_by(FilmDB.eklenme_tarihi.desc()).limit(20).all()
        
    sonuc = []
    for film, arkadas in aktiviteler:
        sonuc.append({
            "arkadas_adi": arkadas.name,
            "arkadas_foto": arkadas.picture,
            "film_adi": film.ad,
            "film_poster": film.poster,
            "puan": film.kisisel_puan,
            "yorum": film.kisisel_yorum
        })
        
    return {"aktiviteler": sonuc}

# ---------------------------------------

@app.get("/search/{icerik_adi}")
def search_content(icerik_adi: str, tur: str = "movie", sirala: str = "yok"):
    if not TMDB_API_KEY: return {"sonuc": []}
    endpoint = f"{BASE_URL}/search/{tur}"
    params = {"api_key": TMDB_API_KEY, "query": icerik_adi, "language": "tr-TR"}
    try:
        data = requests.get(endpoint, params=params).json()
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
            if kisi["job"] == "Director":
                yonetmen = kisi["name"]; break
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
            for p in tr_data["flatrate"]:
                platformlar.append({"ad": p["provider_name"], "logo": f"https://image.tmdb.org/t/p/original{p['logo_path']}"})

    return {
        "baslik": baslik, "ozet": data.get("overview"), "tagline": data.get("tagline"),
        "sure": sure, "puan": data.get("vote_average"),
        "poster": f"https://image.tmdb.org/t/p/w500{data['poster_path']}" if data.get('poster_path') else None,
        "backdrop": f"https://image.tmdb.org/t/p/original{data['backdrop_path']}" if data.get('backdrop_path') else None,
        "youtube_video": f"https://www.youtube.com/embed/{video_key}" if video_key else None,
        "platformlar": platformlar, "yonetmen": yonetmen, "oyuncular": oyuncular, "turler": turler,
        "imdb_id": data.get("external_ids", {}).get("imdb_id")
    }

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