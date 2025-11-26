const API_URL = "";

// Sayfa açılınca hem listeyi hem kullanıcıyı kontrol et
window.onload = async function() {
    await kullaniciKontrol();
};

function bildirimGoster(mesaj, tip = "basarili") {
    const renk = tip === "basarili" ? "linear-gradient(to right, #00b09b, #96c93d)" : "linear-gradient(to right, #ff5f6d, #ffc371)";

    Toastify({
        text: mesaj,
        duration: 3000,
        gravity: "bottom",
        position: "right", 
        style: {
            background: renk,
            borderRadius: "10px",
            fontSize: "16px"
        }
    }).showToast();
}

// --- KULLANICI KONTROLÜ ---
async function kullaniciKontrol() {
    try {
        const res = await fetch(`${API_URL}/user_info`);
        const user = await res.json();
        const loginBtn = document.getElementById("loginBtn");
        const userProfile = document.getElementById("userProfile");
        const watchlistSection = document.querySelector(".watchlist-section");

        if (user) {
            if(loginBtn) loginBtn.style.display = "none";
            if(userProfile) {
                userProfile.style.display = "flex";
                document.getElementById("userName").innerText = `Selam, ${user.given_name || user.name}`;
                document.getElementById("userAvatar").src = user.picture;
            }
            if(watchlistSection) watchlistSection.style.display = "block";
            listeyiGetir();
        } else {
            if(loginBtn) loginBtn.style.display = "inline-block";
            if(userProfile) userProfile.style.display = "none";
            if(watchlistSection) watchlistSection.style.display = "none";
        }
    } catch (error) {
        console.error("Kullanıcı kontrolü hatası:", error);
    }
}

// --- ÇIKIŞ YAPMA ---
async function cikisYap() {
    await fetch(`${API_URL}/auth/logout`);
    window.location.reload();
}

// --- ARAMA FONKSİYONU ---
async function filmAra() {
    const query = document.getElementById("searchInput").value;
    if (!query) return bildirimGoster("⚠️ Lütfen bir film adı yazın!", "hata");

    const container = document.getElementById("resultsContainer");
    container.innerHTML = "Aranıyor...";

    try {
        const res = await fetch(`${API_URL}/search/${query}`);
        const data = await res.json();
        container.innerHTML = "";

        if (!data.sonuc || data.sonuc.length === 0) {
            container.innerHTML = "<p>Film bulunamadı.</p>";
            return;
        }

        data.sonuc.forEach(film => {
            const posterUrl = film.poster ? film.poster : "https://via.placeholder.com/500x750?text=Poster+Yok";
            const safeAd = film.ad.replace(/'/g, "\\'"); 

            const html = `
                <div class="card">
                    <img src="${posterUrl}" alt="${film.ad}">
                    <h3>${film.ad}</h3>
                    <p>⭐ ${film.puan}</p>
                    
                    <button class="detail-btn" onclick="detayAc(${film.tmdb_id})">
                        <i class="fas fa-info-circle"></i> Detay & Fragman
                    </button>

                    <button class="add-btn" onclick="listeyeEkle('${safeAd}', ${film.puan}, '${posterUrl}')">
                        <i class="fas fa-plus"></i> Listeme Ekle
                    </button>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        bildirimGoster("Bağlantı hatası oluştu!", "hata");
    }
}

// --- LİSTEYİ GETİRME ---
async function listeyiGetir() {
    try {
        const res = await fetch(`${API_URL}/listem`);
        const data = await res.json();
        const container = document.getElementById("watchlistContainer");
        if(!container) return;
        container.innerHTML = "";

        if (!data.listem) return;

        data.listem.forEach(film => {
            const html = `
                <div class="list-item">
                    <div>
                        <strong>${film.ad}</strong> <br>
                        <small>⭐ ${film.puan}</small>
                    </div>
                    <button class="delete-btn" onclick="listedenSil(${film.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.innerHTML += html;
        });
    } catch (error) {
        console.error("Liste yüklenemedi:", error);
    }
}

// --- LİSTEDEN SİLME ---
// --- LİSTEDEN SİLME (SweetAlert2 ile Modern Hali) ---
async function listedenSil(id) {
    // 1. Şık bir onay penceresi aç
    const sonuc = await Swal.fire({
        title: 'Emin misin?',
        text: "Bu filmi listenden silmek üzeresin!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e94560', // Bizim tema kırmızısı
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sil gitsin!',
        cancelButtonText: 'Vazgeç',
        background: '#16213e', // Arka plan (Bizim lacivert)
        color: '#fff' // Yazı rengi beyaz
    });

    // 2. Eğer kullanıcı "Evet" dediyse silme işlemini yap
    if (sonuc.isConfirmed) {
        try {
            const res = await fetch(`${API_URL}/sil/${id}`, { method: "DELETE" });
            
            if (res.ok) {
                // Başarılı olursa yine havalı bir bildirim göster
                bildirimGoster("🗑️ Film başarıyla silindi", "basarili");
                listeyiGetir(); // Listeyi yenile
            } else {
                bildirimGoster("Hata oluştu, silinemedi!", "hata");
            }
        } catch (error) {
            console.error("Silme hatası:", error);
            bildirimGoster("Bağlantı hatası!", "hata");
        }
    }
}

// --- DETAY VE MODAL ---
async function detayAc(tmdb_id) {
    const modal = document.getElementById("movieModal");
    modal.style.display = "block"; 
    document.getElementById("modalVideo").innerHTML = "Yükleniyor...";

    try {
        const res = await fetch(`${API_URL}/detay/${tmdb_id}`);
        const data = await res.json();

        document.getElementById("modalTitle").innerText = data.baslik;
        document.getElementById("modalTagline").innerText = data.tagline || "";
        document.getElementById("modalRating").innerText = `⭐ ${data.puan}`;
        document.getElementById("modalRuntime").innerText = `🕒 ${data.sure} dk`;
        document.getElementById("modalOverview").innerText = data.ozet;

        const videoDiv = document.getElementById("modalVideo");
        if (data.youtube_video) {
            videoDiv.innerHTML = `<iframe src="${data.youtube_video}" allowfullscreen></iframe>`;
        } else if (data.backdrop) {
            videoDiv.innerHTML = `<img src="${data.backdrop}" style="width:100%; border-radius:10px;">`;
        } else {
            videoDiv.innerHTML = "<p style='color:white; text-align:center; padding:20px;'>Görsel bulunamadı.</p>";
        }
    } catch (error) {
        console.error("Detay hatası:", error);
    }
}

function modalKapat() {
    document.getElementById("movieModal").style.display = "none";
    document.getElementById("modalVideo").innerHTML = "";
}

// --- LİSTEYE EKLEME ---
async function listeyeEkle(ad, puan, poster) {
    const filmVerisi = { ad: ad, puan: puan, poster: poster };
    try {
        const res = await fetch(`${API_URL}/ekle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(filmVerisi)
        });
        
        if (res.ok) {
            bildirimGoster("✅ " + ad + " listene eklendi!");
            listeyiGetir();
        } else if (res.status === 401) {
            bildirimGoster("⚠️ Önce giriş yapmalısın!", "hata");
        } else {
            bildirimGoster("Bir hata oluştu!", "hata");
        }
    } catch (error) {
        console.error("Ekleme hatası:", error);
    }
}

document.getElementById("searchInput").addEventListener("keypress", function(event) {
    if (event.key === "Enter") filmAra();
});

window.onclick = function(event) {
    const modal = document.getElementById("movieModal");
    if (event.target == modal) modalKapat();
};

