import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '@/features/auth/AuthContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppLayout } from '@/app/AppLayout'
import { LeaguePage } from '@/pages/LeaguePage'
import { PlayersPage } from '@/pages/PlayersPage'
import { PlayerDetailPage } from '@/pages/PlayerDetailPage'
import { MatchesPage } from '@/pages/MatchesPage'
import { MatchDetailPage } from '@/pages/MatchDetailPage'
import { StatsPage } from '@/pages/StatsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { LoginPage } from '@/pages/LoginPage'
import { buildPlayerCard, buildMatch, TEST_LEAGUE_ID, TEST_METRICS } from '@/test/factories'
import { playerKeys } from '@/features/players/api'
import { matchKeys } from '@/features/matches/api'
import { publicKeys } from '@/features/public/api'
import './index.css'

const client = new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false,refetchOnWindowFocus:false,enabled:false}}})
const names = ['Álex Roca', 'Pau Vidal', 'Marc Costa', 'Nil Ferrer', 'Joan Serra', 'Eric Soler', 'Pol Martí', 'Sergi Bosch', 'Víctor Ruiz', 'Guillem Mas', 'Alejandro Fernández de la Vega', 'Oriol Puig', 'Jordi Casas', 'Adrià Font']
const players = names.map((name,i)=>buildPlayerCard({id:`p${i}`,displayName:name,firstName:name.split(' ')[0],lastName:name.split(' ').slice(1).join(' '),cardRating:90-i,marketValueGbp:9000000-i*325000,matchesPlayed:7,totalVictories:7-i%7,totalGoals:14-i,formState:i%2?'up':null}))
const matches=Array.from({length:7},(_,i)=>buildMatch({id:`m${i}`,title:`Jornada ${8-i}`,status:i===0?'scheduled':'scored',played_at:`2026-09-${String(12-i).padStart(2,'0')}T18:00:00Z`}))
const attributes=[{id:'mvp',league_id:TEST_LEAGUE_ID,code:'mvp',label:'MVP',points:2,display_order:1,is_active:true},{id:'zamora',league_id:TEST_LEAGUE_ID,code:'zamora',label:'Zamora',points:1,display_order:2,is_active:true}]
client.setQueryData(publicKeys.snapshot,{league:{id:TEST_LEAGUE_ID,name:'Ultimate Pachangas'},metrics:TEST_METRICS,attributes,players,matches,squads:[],scores:[]})
client.setQueryData(playerKeys.cards(TEST_LEAGUE_ID),players)
client.setQueryData(playerKeys.latestAwards(TEST_LEAGUE_ID),[{attributeCode:'mvp',playerId:'p0'},{attributeCode:'zamora',playerId:'p1'}])
client.setQueryData(matchKeys.list(TEST_LEAGUE_ID),matches)
for(const player of players){
  client.setQueryData(playerKeys.card(player.id),player)
  client.setQueryData(playerKeys.history(player.id),matches.slice(1).map((match,i)=>({matchId:match.id,matchTitle:match.title,playedAt:match.played_at,finalScore:8-i*.25,baseScore:7,goals:2,victory:1,metricScores:{attack:8,defence:7,tactics:8.5,physical:6+i*.3},attributes:[]})))
}
for(const match of matches){
  client.setQueryData(matchKeys.detail(match.id),match)
  client.setQueryData(matchKeys.squad(match.id),players.map((p,i)=>({playerId:p.id,playerCode:p.playerCode,firstName:p.firstName,lastName:p.lastName,displayName:p.displayName,preferredPosition:p.preferredPosition,teamSide:i<7?'home':'away',pitchSlot:i%7,marketValueGbp:p.marketValueGbp})))
  client.setQueryData(matchKeys.scores(match.id),match.status==='scored'?players.map((p,i)=>({playerId:p.id,displayName:p.displayName,goals:i%3,victory:i<7?1:0,baseScore:7,finalScore:9-i*.2,metricScores:{attack:8,defence:7,tactics:8.5,physical:6},attributes:[]})):[])
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><AuthContext.Provider value={{session:null,user:null,isLoading:false}}><TooltipProvider><HashRouter><div className="technical bg-primary px-3 py-1 text-center text-[10px] text-black">PRUEBA LOCAL · DATOS FICTICIOS</div><Routes><Route element={<AppLayout/>}><Route path="/league" element={<LeaguePage/>}/><Route path="/players" element={<PlayersPage/>}/><Route path="/players/:playerId" element={<PlayerDetailPage/>}/><Route path="/matches" element={<MatchesPage/>}/><Route path="/matches/:matchId" element={<MatchDetailPage/>}/><Route path="/stats" element={<StatsPage/>}/><Route path="/profile" element={<ProfilePage/>}/></Route><Route path="/login" element={<LoginPage/>}/><Route path="*" element={<Navigate to="/league" replace/>}/></Routes></HashRouter></TooltipProvider></AuthContext.Provider></QueryClientProvider>)
