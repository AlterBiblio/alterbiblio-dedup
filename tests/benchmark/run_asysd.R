.libPaths(file.path(getwd(),"tests/benchmark/r_lib"))
suppressMessages(library(ASySD))
sets <- list(c("Diabetes","latin1"), c("NeuroImaging","UTF-8"), c("Cardiac","UTF-8"))
perf <- function(name, enc){
  f <- sprintf("tests/benchmark/data/asysd/%s_duplicates_labelled.csv", name)
  d <- read.csv(f, fileEncoding=enc, stringsAsFactors=FALSE, colClasses="character")
  # dedup_citations espera record_id; ya existe en el CSV
  res <- tryCatch(dedup_citations(d, keep_label="Unique", merge_citations=FALSE),
                  error=function(e){cat("  ERR dedup:",conditionMessage(e),"\n"); NULL})
  if(is.null(res)) return(NULL)
  uniq <- res$unique
  d$pred <- ifelse(d$record_id %in% uniq$record_id, "Unique", "Duplicate")
  TN <- sum(d$label=="Unique"    & d$pred=="Unique")
  FN <- sum(d$label=="Duplicate" & d$pred=="Unique")
  TP <- sum(d$label=="Duplicate" & d$pred=="Duplicate")
  FP <- sum(d$label=="Unique"    & d$pred=="Duplicate")
  sens <- round(TP/(TP+FN)*100,2); spec <- round(TN/(TN+FP)*100,2)
  cat(sprintf("%-12s n=%d | TN=%d FP=%d FN=%d TP=%d | Sens=%.2f%% Spec=%.2f%% (chequeo: U=%d D=%d)\n",
              name, nrow(d), TN,FP,FN,TP, sens, spec, TN+FP, TP+FN))
}
for(s in sets) perf(s[1], s[2])
